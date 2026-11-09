package com.minh.bookingservice.dto.response;

import com.minh.bookingservice.entity.Booking;
import com.minh.bookingservice.enums.BookingStatus;
import lombok.Builder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

@Builder
public record BookingResponse(
        String id,
        String userId,
        String eventId,
        BookingStatus status,
        BigDecimal totalAmount,
        String idempotencyKey,
        Instant expiresAt,
        Instant createdAt,
        List<BookingItemResponse> items
) {
    public static BookingResponse from(Booking b) {
        List<BookingItemResponse> itemList = (b.getItems() == null)
                ? Collections.emptyList()
                : b.getItems().stream().map(BookingItemResponse::from).toList();

        return new BookingResponse(
                b.getId(),
                b.getUserId(),
                b.getEventId(),
                b.getStatus(),
                b.getTotalAmount(),
                b.getIdempotencyKey(),
                b.getExpiresAt(),
                b.getCreatedAt(),
                itemList
        );
    }
}
