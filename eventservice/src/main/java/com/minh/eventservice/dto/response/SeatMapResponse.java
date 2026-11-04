package com.minh.eventservice.dto.response;

import java.math.BigDecimal;
import java.util.List;

public record SeatMapResponse(
        String eventId,
        String venueId,
        int venueCapacity,
        int totalConfiguredSeats,
        List<SectionDetail> sections
) {
    public record SectionDetail(
            String id,
            String name,
            TierDetail tier,
            int rowCount,
            int seatsPerRow,
            int totalSeats,
            List<SeatDetail> seats
    ) {
    }

    public record TierDetail(
            String id,
            String name,
            BigDecimal price,
            String currency
    ) {
    }

    public record SeatDetail(
            String seatId,
            int row,
            int seat
    ) {
    }
}
