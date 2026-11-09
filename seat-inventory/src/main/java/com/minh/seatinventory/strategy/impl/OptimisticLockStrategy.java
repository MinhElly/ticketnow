package com.minh.seatinventory.strategy.impl;

import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.repository.SeatRepository;
import com.minh.seatinventory.strategy.SeatLockStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service("optimisticLockStrategy")
@RequiredArgsConstructor
@Slf4j
public class OptimisticLockStrategy implements SeatLockStrategy {

    private final SeatRepository seatRepository;
    private static final int MAX_RETRIES = 2;

    @Override
    public HoldResult hold(String eventId, List<String> seatIds, String bookingId, Duration ttl) {
        if (seatIds == null || seatIds.isEmpty()) {
            return HoldResult.fail(Collections.emptyList(), "Seat list is empty");
        }

        List<String> distinctSeatIds = seatIds.stream().distinct().sorted().toList();

        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return executeHold(eventId, distinctSeatIds, bookingId, ttl);
            } catch (ObjectOptimisticLockingFailureException ex) {
                log.warn("Optimistic lock conflict on attempt {}/{} for booking {} on event {}",
                        attempt + 1, MAX_RETRIES + 1, bookingId, eventId);
                if (attempt == MAX_RETRIES) {
                    return HoldResult.fail(distinctSeatIds, "Concurrent modification conflict, please retry");
                }
                try {
                    Thread.sleep(50L * (attempt + 1));
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                    return HoldResult.fail(distinctSeatIds, "Interrupted during retry");
                }
            }
        }

        return HoldResult.fail(distinctSeatIds, "Exceeded retry attempts");
    }

    @Transactional
    protected HoldResult executeHold(String eventId, List<String> distinctSeatIds, String bookingId, Duration ttl) {
        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, distinctSeatIds);
        Map<String, Seat> seatMap = seats.stream().collect(Collectors.toMap(s -> s.getId().getSeatId(), s -> s));

        List<String> failedSeatIds = new ArrayList<>();
        Instant now = Instant.now();

        for (String seatId : distinctSeatIds) {
            Seat seat = seatMap.get(seatId);
            if (seat == null) {
                failedSeatIds.add(seatId);
            } else if (seat.getStatus() == SeatStatus.SOLD) {
                failedSeatIds.add(seatId);
            } else if (seat.getStatus() == SeatStatus.HELD) {
                boolean isMine = bookingId.equals(seat.getHeldByBooking());
                boolean isExpired = seat.getHeldUntil() != null && seat.getHeldUntil().isBefore(now);
                if (!isMine && !isExpired) {
                    failedSeatIds.add(seatId);
                }
            }
        }

        if (!failedSeatIds.isEmpty()) {
            return HoldResult.fail(failedSeatIds, "One or more seats are unavailable");
        }

        Instant expiresAt = now.plus(ttl);
        for (Seat seat : seats) {
            seat.setStatus(SeatStatus.HELD);
            seat.setHeldByBooking(bookingId);
            seat.setHeldUntil(expiresAt);
        }
        seatRepository.saveAll(seats);
        seatRepository.flush(); // Buộc flush để kích hoạt kiểm tra @Version ngay trong block

        log.info("Optimistic hold succeeded for booking {} on {} seats", bookingId, seats.size());
        return HoldResult.success(expiresAt);
    }

    @Override
    @Transactional
    public void release(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, seatIds);
        List<Seat> toRelease = new ArrayList<>();

        for (Seat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD && bookingId.equals(seat.getHeldByBooking())) {
                seat.setStatus(SeatStatus.AVAILABLE);
                seat.setHeldByBooking(null);
                seat.setHeldUntil(null);
                toRelease.add(seat);
            }
        }

        if (!toRelease.isEmpty()) {
            seatRepository.saveAll(toRelease);
            log.info("Optimistic release succeeded for booking {} on {} seats", bookingId, toRelease.size());
        }
    }

    @Override
    @Transactional
    public void confirm(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, seatIds);
        List<Seat> toConfirm = new ArrayList<>();

        for (Seat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD && bookingId.equals(seat.getHeldByBooking())) {
                seat.setStatus(SeatStatus.SOLD);
                seat.setHeldUntil(null);
                toConfirm.add(seat);
            }
        }

        if (!toConfirm.isEmpty()) {
            seatRepository.saveAll(toConfirm);
            log.info("Optimistic confirm succeeded for booking {} on {} seats", bookingId, toConfirm.size());
        }
    }

    @Override
    @Transactional
    public void revertSold(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, seatIds.stream().distinct().toList());
        List<Seat> toRevert = new ArrayList<>();

        for (Seat seat : seats) {
            if (seat.getStatus() == SeatStatus.SOLD
                    && (bookingId == null || bookingId.isBlank() || bookingId.equals(seat.getHeldByBooking()))) {
                seat.setStatus(SeatStatus.AVAILABLE);
                seat.setHeldByBooking(null);
                seat.setHeldUntil(null);
                toRevert.add(seat);
            }
        }

        if (!toRevert.isEmpty()) {
            seatRepository.saveAll(toRevert);
            log.info("Optimistic revert (SOLD -> AVAILABLE) succeeded for {} seats", toRevert.size());
        }
    }
}
