package com.minh.paymentservice.gateway;

public record PaymentInitResult(
        String paymentLinkId,
        String checkoutUrl,
        String qrCode,
        String transactionReference
) {}
