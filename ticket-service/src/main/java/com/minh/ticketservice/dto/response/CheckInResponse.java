package com.minh.ticketservice.dto.response;

import java.time.Instant;

public record CheckInResponse(
        boolean success,
        String ticketCode,
        String eventId,
        String seatCode,
        String tierName,
        String status,
        Instant checkedInAt,
        String message
) {}
