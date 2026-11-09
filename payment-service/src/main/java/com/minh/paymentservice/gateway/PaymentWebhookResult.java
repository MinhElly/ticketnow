package com.minh.paymentservice.gateway;

public record PaymentWebhookResult(
        boolean verified,
        Long orderCode,
        Long amount,
        boolean success,
        String transactionReference,
        String message
) {}
