package com.minh.ticketservice.dto.event;

import java.math.BigDecimal;

public record PaymentSucceededPayload(
        String paymentId,
        String bookingId,
        String userId,
        BigDecimal amount,
        String currency,
        String provider,
        String transactionId,
        Long orderCode
) {}
