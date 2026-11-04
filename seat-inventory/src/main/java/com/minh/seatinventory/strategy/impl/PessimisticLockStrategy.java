package com.minh.seatinventory.strategy.impl;

import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.repository.SeatRepository;
import com.minh.seatinventory.strategy.SeatLockStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service("pessimisticLockStrategy")
@RequiredArgsConstructor
@Slf4j
public class PessimisticLockStrategy implements SeatLockStrategy {

    private final SeatRepository seatRepository;

    @Override
    @Transactional
    public HoldResult hold(String eventId, List<String> seatIds, String bookingId, Duration ttl) {
        if (seatIds == null || seatIds.isEmpty()) {
            return HoldResult.fail(Collections.emptyList(), "Seat list is empty");
        }

        // Loại bỏ trùng lặp trong input và sắp xếp để tránh deadlock
        List<String> distinctSeatIds = seatIds.stream().distinct().sorted().toList();

        // Khóa ghi các dòng ghế theo thứ tự cố định
        List<Seat> seats = seatRepository.findSeatsForUpdateOrdered(eventId, distinctSeatIds);
        Map<String, Seat> seatMap = seats.stream().collect(Collectors.toMap(s -> s.getId().getSeatId(), s -> s));

        List<String> failedSeatIds = new ArrayList<>();
        Instant now = Instant.now();

        for (String seatId : distinctSeatIds) {
            Seat seat = seatMap.get(seatId);
            if (seat == null) {
                // Ghế không tồn tại
                failedSeatIds.add(seatId);
            } else if (seat.getStatus() == SeatStatus.SOLD) {
                // Ghế đã bán
                failedSeatIds.add(seatId);
            } else if (seat.getStatus() == SeatStatus.HELD) {
                // Ghế đang bị giữ bởi booking khác và chưa hết hạn
                boolean isMine = bookingId.equals(seat.getHeldByBooking());
                boolean isExpired = seat.getHeldUntil() != null && seat.getHeldUntil().isBefore(now);
                if (!isMine && !isExpired) {
                    failedSeatIds.add(seatId);
                }
            }
        }

        if (!failedSeatIds.isEmpty()) {
            log.warn("Pessimistic hold failed for booking {} on event {}. Unavailable seats: {}",
                    bookingId, eventId, failedSeatIds);
            return HoldResult.fail(failedSeatIds, "One or more seats are unavailable");
        }

        Instant expiresAt = now.plus(ttl);
        for (Seat seat : seats) {
            seat.setStatus(SeatStatus.HELD);
            seat.setHeldByBooking(bookingId);
            seat.setHeldUntil(expiresAt);
        }
        seatRepository.saveAll(seats);

        log.info("Pessimistic hold succeeded for booking {} on {} seats until {}",
                bookingId, seats.size(), expiresAt);
        return HoldResult.success(expiresAt);
    }

    @Override
    @Transactional
    public void release(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<Seat> seats = seatRepository.findSeatsForUpdateOrdered(eventId, seatIds.stream().distinct().sorted().toList());
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
            log.info("Pessimistic release succeeded for booking {} on {} seats", bookingId, toRelease.size());
        }
    }

    @Override
    @Transactional
    public void confirm(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<Seat> seats = seatRepository.findSeatsForUpdateOrdered(eventId, seatIds.stream().distinct().sorted().toList());
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
            log.info("Pessimistic confirm (HELD -> SOLD) succeeded for booking {} on {} seats", bookingId, toConfirm.size());
        }
    }
}
