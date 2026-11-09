package com.minh.ticketservice.dto.response;

import java.time.Instant;

public record CheckInRecordResponse(
        String id,
        String checkedInBy,
        String deviceInfo,
        Instant checkedInAt
) {}
