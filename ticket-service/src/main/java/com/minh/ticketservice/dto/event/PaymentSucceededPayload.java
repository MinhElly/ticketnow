package com.minh.ticketservice.dto.event;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.math.BigDecimal;

public record PaymentSucceededPayload(
        String paymentId,
        String bookingId,
        String userId,
        BigDecimal amount,
        String currency,
        String provider,
        @JsonAlias({"transactionReference", "transactionId"})
        String transactionReference,
        Long orderCode
) {}
