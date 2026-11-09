package com.minh.paymentservice.gateway;

import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentProvider;

import java.util.Map;

public interface PaymentGatewayAdapter {

    PaymentProvider getProvider();

    PaymentInitResult createPaymentLink(Payment payment, String description);

    PaymentWebhookResult verifyAndProcessWebhook(Map<String, Object> webhookBody, String signatureHeader);
}
