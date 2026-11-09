package com.minh.ticketservice.dto.event;

import java.math.BigDecimal;

public record TicketIssuedPayload(
        String ticketId,
        String ticketCode,
        String bookingId,
        String eventId,
        String seatId,
        String seatCode,
        String tierName,
        BigDecimal price,
        String userId,
        String qrCodeUrl
) {}
