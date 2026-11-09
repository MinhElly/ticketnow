package com.minh.bookingservice.dto.response;

import com.minh.bookingservice.entity.BookingItem;
import lombok.Builder;

import java.math.BigDecimal;

@Builder
public record BookingItemResponse(
        String seatId,
        String tierId,
        BigDecimal price
) {
    public static BookingItemResponse from(BookingItem item) {
        return new BookingItemResponse(
                item.getId().getSeatId(),
                item.getTierId(),
                item.getPrice()
        );
    }
}
