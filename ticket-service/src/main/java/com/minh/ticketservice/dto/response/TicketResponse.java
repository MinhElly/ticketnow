package com.minh.ticketservice.dto.response;

import com.minh.ticketservice.enums.TicketStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record TicketResponse(
        String id,
        String ticketCode,
        String bookingId,
        String eventId,
        String seatId,
        String seatCode,
        String tierName,
        BigDecimal price,
        String currency,
        String userId,
        TicketStatus status,
        String qrPayload,
        String qrCodeUrl,
        Instant createdAt,
        List<CheckInRecordResponse> checkIns
) {}
