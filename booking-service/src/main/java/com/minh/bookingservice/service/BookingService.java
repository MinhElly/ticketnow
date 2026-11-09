package com.minh.bookingservice.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.bookingservice.client.HoldResult;
import com.minh.bookingservice.client.SeatInventoryClient;
import com.minh.bookingservice.config.CurrentUser;
import com.minh.bookingservice.dto.request.CreateBookingRequest;
import com.minh.bookingservice.dto.response.BookingResponse;
import com.minh.bookingservice.dto.response.PageResponse;
import com.minh.bookingservice.entity.*;
import com.minh.bookingservice.enums.BookingStatus;
import com.minh.bookingservice.enums.IdempotencyStatus;
import com.minh.bookingservice.exception.ApiException;
import com.minh.bookingservice.repository.BookingRepository;
import com.minh.bookingservice.repository.IdempotencyRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class BookingService {

    private final BookingRepository bookingRepository;
    private final IdempotencyRecordRepository idempotencyRecordRepository;
    private final SeatInventoryClient seatInventoryClient;
    private final CurrentUser currentUser;
    private final ObjectMapper objectMapper;

    @Value("${booking.hold-ttl-seconds:600}")
    private int holdTtlSeconds;

    private String computeHash(CreateBookingRequest request) {
        List<String> sortedSeats = request.seats().stream()
                .map(s -> s.seatId() + ":" + Objects.toString(s.tierId(), "") + ":" + s.price())
                .sorted()
                .toList();

        String raw = request.eventId() + "|" + String.join(",", sortedSeats);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    private void requireOwnerOrAdmin(Booking booking) {
        if (!currentUser.isAdmin() && !currentUser.subject().equals(booking.getUserId())) {
            throw new AccessDeniedException("You do not have permission to view or manage this booking");
        }
    }

    @Transactional
    public BookingResponse createBooking(String userId, String idempotencyKey, CreateBookingRequest request) {
        if (idempotencyKey == null || idempotencyKey.trim().isBlank()) {
            throw ApiException.badRequest("Idempotency-Key header is required");
        }
        String trimmedKey = idempotencyKey.trim();
        String requestHash = computeHash(request);

        IdempotencyRecordId idempId = new IdempotencyRecordId(userId, trimmedKey);
        Optional<IdempotencyRecord> existingRecordOpt = idempotencyRecordRepository.findById(idempId);

        if (existingRecordOpt.isPresent()) {
            IdempotencyRecord record = existingRecordOpt.get();
            if (!record.getRequestHash().equals(requestHash)) {
                throw ApiException.unprocessableEntity("Idempotency key was previously used with different request parameters");
            }
            if (record.getStatus() == IdempotencyStatus.COMPLETED) {
                Booking existingBooking = bookingRepository.findByUserIdAndIdempotencyKey(userId, trimmedKey)
                        .orElse(null);
                if (existingBooking != null) {
                    return BookingResponse.from(existingBooking);
                }
            } else if (record.getStatus() == IdempotencyStatus.IN_PROGRESS) {
                throw ApiException.conflict("A booking request with this Idempotency key is currently in progress");
            }
        }

        // 1. Tính tổng tiền
        BigDecimal totalAmount = request.seats().stream()
                .map(CreateBookingRequest.SeatSelection::price)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 2. Tạo Booking PENDING
        Booking booking = Booking.builder()
                .userId(userId)
                .eventId(request.eventId())
                .status(BookingStatus.PENDING)
                .totalAmount(totalAmount)
                .idempotencyKey(trimmedKey)
                .items(new ArrayList<>())
                .build();
        booking = bookingRepository.saveAndFlush(booking);

        // 3. Đánh dấu IdempotencyRecord IN_PROGRESS
        IdempotencyRecord record = IdempotencyRecord.builder()
                .id(idempId)
                .requestHash(requestHash)
                .status(IdempotencyStatus.IN_PROGRESS)
                .build();
        idempotencyRecordRepository.saveAndFlush(record);

        // 4. Giữ ghế qua seat-inventory (đồng bộ)
        List<String> seatIds = request.seats().stream()
                .map(CreateBookingRequest.SeatSelection::seatId)
                .distinct()
                .toList();

        HoldResult holdResult = seatInventoryClient.holdSeats(request.eventId(), seatIds, booking.getId(), holdTtlSeconds);

        if (holdResult == null || !holdResult.isSuccess()) {
            booking.setStatus(BookingStatus.CANCELLED);
            bookingRepository.save(booking);
            idempotencyRecordRepository.delete(record);

            List<String> failed = (holdResult != null && holdResult.getFailedSeatIds() != null)
                    ? holdResult.getFailedSeatIds()
                    : Collections.emptyList();
            throw ApiException.conflict("One or more seats are unavailable: " + failed);
        }

        // 5. Cập nhật AWAITING_PAYMENT & gắn items
        Instant expiresAt = (holdResult.getExpiresAt() != null)
                ? holdResult.getExpiresAt()
                : Instant.now().plusSeconds(holdTtlSeconds);

        booking.setStatus(BookingStatus.AWAITING_PAYMENT);
        booking.setExpiresAt(expiresAt);

        for (var s : request.seats()) {
            BookingItem item = BookingItem.builder()
                    .id(new BookingItemId(booking.getId(), s.seatId()))
                    .tierId(s.tierId())
                    .price(s.price())
                    .booking(booking)
                    .build();
            booking.getItems().add(item);
        }
        booking = bookingRepository.saveAndFlush(booking);

        BookingResponse response = BookingResponse.from(booking);

        // 6. Hoàn tất IdempotencyRecord
        record.setStatus(IdempotencyStatus.COMPLETED);
        record.setResponseCode(201);
        try {
            record.setResponseBody(objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Failed to serialize booking response for idempotency cache: {}", e.getMessage());
        }
        idempotencyRecordRepository.saveAndFlush(record);

        return response;
    }

    @Transactional(readOnly = true)
    public BookingResponse getBooking(String id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Booking"));
        requireOwnerOrAdmin(booking);
        return BookingResponse.from(booking);
    }

    @Transactional(readOnly = true)
    public PageResponse<BookingResponse> listMyBookings(String userId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Booking> bookings = bookingRepository.findByUserId(userId, pageable);
        return PageResponse.from(bookings.map(BookingResponse::from));
    }

    @Transactional
    public BookingResponse cancelBooking(String id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Booking"));
        requireOwnerOrAdmin(booking);

        if (booking.getStatus() != BookingStatus.AWAITING_PAYMENT) {
            throw ApiException.conflict("Only bookings in AWAITING_PAYMENT status can be cancelled (current status: " + booking.getStatus() + ")");
        }

        List<String> seatIds = booking.getItems().stream()
                .map(i -> i.getId().getSeatId())
                .toList();

        seatInventoryClient.releaseSeats(booking.getEventId(), seatIds, booking.getId());

        booking.setStatus(BookingStatus.CANCELLED);
        return BookingResponse.from(bookingRepository.save(booking));
    }

    @Transactional
    public BookingResponse confirmBooking(String id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Booking"));
        requireOwnerOrAdmin(booking);

        if (booking.getStatus() != BookingStatus.AWAITING_PAYMENT) {
            throw ApiException.conflict("Only bookings in AWAITING_PAYMENT status can be confirmed (current status: " + booking.getStatus() + ")");
        }

        if (booking.getExpiresAt() != null && booking.getExpiresAt().isBefore(Instant.now())) {
            booking.setStatus(BookingStatus.EXPIRED);
            bookingRepository.save(booking);
            throw ApiException.conflict("Booking hold has expired");
        }

        List<String> seatIds = booking.getItems().stream()
                .map(i -> i.getId().getSeatId())
                .toList();

        seatInventoryClient.confirmSeats(booking.getEventId(), seatIds, booking.getId());

        booking.setStatus(BookingStatus.CONFIRMED);
        return BookingResponse.from(bookingRepository.save(booking));
    }
}
