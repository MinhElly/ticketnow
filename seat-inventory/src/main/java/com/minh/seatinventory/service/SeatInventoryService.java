package com.minh.seatinventory.service;

import com.minh.seatinventory.dto.request.ConfirmSeatsRequest;
import com.minh.seatinventory.dto.request.HoldSeatsRequest;
import com.minh.seatinventory.dto.request.InitSeatsRequest;
import com.minh.seatinventory.dto.request.ReleaseSeatsRequest;
import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.dto.response.SeatResponse;
import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.entity.SeatId;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.exception.ApiException;
import com.minh.seatinventory.repository.SeatRepository;
import com.minh.seatinventory.strategy.SeatLockStrategy;
import com.minh.seatinventory.strategy.SeatLockStrategyFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SeatInventoryService {

    private final SeatRepository seatRepository;
    private final SeatLockStrategyFactory strategyFactory;

    @Value("${seat.lock.default-ttl-seconds:600}")
    private int defaultTtlSeconds;

    @Transactional
    public List<SeatResponse> initializeSeats(String eventId, InitSeatsRequest request) {
        if (request.getSeats() == null || request.getSeats().isEmpty()) {
            throw ApiException.badRequest("Seat specifications cannot be empty");
        }

        List<Seat> existing = seatRepository.findById_EventId(eventId);
        Set<String> existingSeatIds = existing.stream()
                .map(s -> s.getId().getSeatId())
                .collect(Collectors.toSet());

        List<Seat> toCreate = new ArrayList<>();
        Instant now = Instant.now();

        for (InitSeatsRequest.SeatSpec spec : request.getSeats()) {
            if (!existingSeatIds.contains(spec.getSeatId())) {
                Seat seat = Seat.builder()
                        .id(new SeatId(eventId, spec.getSeatId()))
                        .tierId(spec.getTierId())
                        .status(SeatStatus.AVAILABLE)
                        .createdAt(now)
                        .updatedAt(now)
                        .version(0L)
                        .build();
                toCreate.add(seat);
            }
        }

        if (!toCreate.isEmpty()) {
            seatRepository.saveAll(toCreate);
            log.info("Initialized {} new seats for event {}", toCreate.size(), eventId);
        }

        return getEventSeats(eventId);
    }

    /**
     * REST entry point: keeps the existing 409 behavior when a hold fails.
     */
    public HoldResult holdSeats(String eventId, HoldSeatsRequest request) {
        HoldResult result = attemptHoldSeats(eventId, request);

        if (!result.isSuccess()) {
            throw ApiException.conflict(result.getMessage() + ": " + result.getFailedSeatIds());
        }

        return result;
    }

    /**
     * gRPC entry point: failures are represented in HoldResponse.success=false
     * (with failed_seat_ids) instead of an exception.
     */
    public HoldResult attemptHoldSeats(String eventId, HoldSeatsRequest request) {
        int ttl = (request.getTtlSeconds() != null && request.getTtlSeconds() > 0)
                ? request.getTtlSeconds()
                : defaultTtlSeconds;

        SeatLockStrategy strategy = strategyFactory.getStrategy();
        return strategy.hold(eventId, request.getSeatIds(), request.getBookingId(), Duration.ofSeconds(ttl));
    }

    public void releaseSeats(String eventId, ReleaseSeatsRequest request) {
        SeatLockStrategy strategy = strategyFactory.getStrategy();
        strategy.release(eventId, request.getSeatIds(), request.getBookingId());
    }

    public void confirmSeats(String eventId, ConfirmSeatsRequest request) {
        SeatLockStrategy strategy = strategyFactory.getStrategy();
        strategy.confirm(eventId, request.getSeatIds(), request.getBookingId());
    }

    public void revertSold(String eventId, List<String> seatIds, String bookingId) {
        SeatLockStrategy strategy = strategyFactory.getStrategy();
        strategy.revertSold(eventId, seatIds, bookingId);
    }

    @Transactional(readOnly = true)
    public List<SeatResponse> getEventSeats(String eventId) {
        List<Seat> seats = seatRepository.findById_EventId(eventId);
        Instant now = Instant.now();

        return seats.stream().map(seat -> {
            SeatStatus effectiveStatus = seat.getStatus();
            if (effectiveStatus == SeatStatus.HELD && seat.getHeldUntil() != null && seat.getHeldUntil().isBefore(now)) {
                effectiveStatus = SeatStatus.AVAILABLE;
            }
            return SeatResponse.builder()
                    .seatId(seat.getId().getSeatId())
                    .tierId(seat.getTierId())
                    .status(effectiveStatus)
                    .heldUntil(seat.getHeldUntil())
                    .build();
        }).toList();
    }
}
