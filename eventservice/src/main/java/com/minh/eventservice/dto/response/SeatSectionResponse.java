package com.minh.eventservice.dto.response;

import com.minh.eventservice.entity.SeatSection;

public record SeatSectionResponse(
        String id,
        String eventId,
        String tierId,
        String tierName,
        String name,
        int rowCount,
        int seatsPerRow,
        int totalSeats
) {
    public static SeatSectionResponse from(SeatSection s) {
        return new SeatSectionResponse(
                s.getId(),
                s.getEvent().getId(),
                s.getTier().getId(),
                s.getTier().getName(),
                s.getName(),
                s.getRowCount(),
                s.getSeatsPerRow(),
                s.getRowCount() * s.getSeatsPerRow()
        );
    }
}
