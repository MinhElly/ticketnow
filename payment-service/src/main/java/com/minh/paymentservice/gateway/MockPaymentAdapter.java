package com.minh.paymentservice.gateway;

import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@Slf4j
public class MockPaymentAdapter implements PaymentGatewayAdapter {

    private final long delayMs;
    private final boolean autoConfirm;

    public MockPaymentAdapter(
            @Value("${payment.mock.delay-ms:0}") long delayMs,
            @Value("${payment.mock.auto-confirm:false}") boolean autoConfirm) {
        this.delayMs = delayMs;
        this.autoConfirm = autoConfirm;
    }

    @Override
    public PaymentProvider getProvider() {
        return PaymentProvider.MOCK;
    }

    @Override
    public PaymentInitResult createPaymentLink(Payment payment, String description) {
        if (delayMs > 0) {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        String paymentLinkId = "mock_link_" + UUID.randomUUID();
        String checkoutUrl = String.format("http://localhost:3000/checkout/mock?orderCode=%d&amount=%d&bookingId=%s",
                payment.getOrderCode(), payment.getAmount(), payment.getBookingId());

        // Standard simulated VietQR EMVCo string payload
        String mockVietQr = String.format("00020101021238540010A000000727012400069704220110034567890208QRIBFTTA5303704540%d5802VN62180814TICKETNOW%d6304MOCK",
                payment.getAmount(), payment.getOrderCode());

        log.info("MockPaymentAdapter created mock link for orderCode: {}, amount: {}",
                payment.getOrderCode(), payment.getAmount());

        return new PaymentInitResult(paymentLinkId, checkoutUrl, mockVietQr, "MOCK_REF_" + payment.getOrderCode());
    }

    @Override
    public PaymentWebhookResult verifyAndProcessWebhook(Map<String, Object> webhookBody, String signatureHeader) {
        if (webhookBody == null) {
            return new PaymentWebhookResult(false, null, null, false, null, "Empty payload");
        }

        Long orderCode = null;
        Long amount = null;
        boolean success = true;

        if (webhookBody.containsKey("data") && webhookBody.get("data") instanceof Map<?, ?> data) {
            Object orderCodeObj = data.get("orderCode");
            if (orderCodeObj instanceof Number n) orderCode = n.longValue();
            else if (orderCodeObj != null) orderCode = Long.parseLong(orderCodeObj.toString());

            Object amountObj = data.get("amount");
            if (amountObj instanceof Number n) amount = n.longValue();
            else if (amountObj != null) amount = Long.parseLong(amountObj.toString());

            String code = String.valueOf(data.get("code"));
            success = "00".equals(code) || "PAID".equalsIgnoreCase(code) || "SUCCESS".equalsIgnoreCase(code);
        } else {
            Object orderCodeObj = webhookBody.get("orderCode");
            if (orderCodeObj instanceof Number n) orderCode = n.longValue();
            else if (orderCodeObj != null) orderCode = Long.parseLong(orderCodeObj.toString());

            Object amountObj = webhookBody.get("amount");
            if (amountObj instanceof Number n) amount = n.longValue();
            else if (amountObj != null) amount = Long.parseLong(amountObj.toString());

            if (webhookBody.containsKey("status")) {
                String status = String.valueOf(webhookBody.get("status"));
                success = "PAID".equalsIgnoreCase(status) || "SUCCESS".equalsIgnoreCase(status);
            }
        }

        return new PaymentWebhookResult(true, orderCode, amount, success, "MOCK_TX_" + orderCode, "Verified Mock Webhook");
    }
}
