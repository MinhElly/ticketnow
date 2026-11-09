package com.minh.paymentservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentProvider;
import com.minh.paymentservice.enums.PaymentStatus;
import com.minh.paymentservice.gateway.PayOsPaymentAdapter;
import com.minh.paymentservice.gateway.PaymentWebhookResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PayOsPaymentAdapterTests {

    private PayOsPaymentAdapter adapter;
    private final String checksumKey = "test-checksum-key-1234567890abcdef";

    @BeforeEach
    void setUp() {
        RestClient restClient = Mockito.mock(RestClient.class);
        ObjectMapper mapper = new ObjectMapper();
        adapter = new PayOsPaymentAdapter(
                restClient, mapper,
                "test-client-id", "test-api-key", checksumKey,
                "https://api-merchant.payos.vn",
                "http://localhost:3000/success", "http://localhost:3000/cancel"
        );
    }

    @Test
    void testComputeHmacSha256() {
        String data = "amount=50000&cancelUrl=http://cancel&description=test&orderCode=123456&returnUrl=http://success";
        String hash = PayOsPaymentAdapter.computeHmacSha256(data, checksumKey);

        assertThat(hash).isNotNull();
        assertThat(hash).hasSize(64); // 256 bits = 64 hex characters
    }

    @Test
    void testVerifyWebhook_Success() {
        long orderCode = 9876543210L;
        long amount = 150000L;

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", orderCode);
        data.put("amount", amount);
        data.put("code", "00");
        data.put("desc", "success");
        data.put("reference", "FT12345678");

        // Compute valid signature for the data
        String dataToSign = String.format("amount=%d&code=00&desc=success&orderCode=%d&reference=FT12345678", amount, orderCode);
        String signature = PayOsPaymentAdapter.computeHmacSha256(dataToSign, checksumKey);

        Map<String, Object> webhookBody = new HashMap<>();
        webhookBody.put("data", data);
        webhookBody.put("signature", signature);

        PaymentWebhookResult result = adapter.verifyAndProcessWebhook(webhookBody, null);

        assertThat(result.verified()).isTrue();
        assertThat(result.success()).isTrue();
        assertThat(result.orderCode()).isEqualTo(orderCode);
        assertThat(result.amount()).isEqualTo(amount);
        assertThat(result.transactionReference()).isEqualTo("FT12345678");
    }

    @Test
    void testVerifyWebhook_TamperedAmount_Rejected() {
        long orderCode = 9876543210L;
        long amount = 150000L;

        // Legitimate signature computed for 150000
        String dataToSign = String.format("amount=%d&code=00&desc=success&orderCode=%d&reference=FT12345678", amount, orderCode);
        String signature = PayOsPaymentAdapter.computeHmacSha256(dataToSign, checksumKey);

        // Attacker alters amount in body to 15000
        Map<String, Object> tamperedData = new HashMap<>();
        tamperedData.put("orderCode", orderCode);
        tamperedData.put("amount", 15000L); // Tampered!
        tamperedData.put("code", "00");
        tamperedData.put("desc", "success");
        tamperedData.put("reference", "FT12345678");

        Map<String, Object> webhookBody = new HashMap<>();
        webhookBody.put("data", tamperedData);
        webhookBody.put("signature", signature);

        PaymentWebhookResult result = adapter.verifyAndProcessWebhook(webhookBody, null);

        assertThat(result.verified()).isFalse();
        assertThat(result.message()).contains("Invalid webhook HMAC signature");
    }
}
