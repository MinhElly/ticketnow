package com.minh.paymentservice.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentProvider;
import com.minh.paymentservice.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Component
@Slf4j
public class PayOsPaymentAdapter implements PaymentGatewayAdapter {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String clientId;
    private final String apiKey;
    private final String checksumKey;
    private final String baseUrl;
    private final String returnUrl;
    private final String cancelUrl;

    public PayOsPaymentAdapter(
            RestClient restClient,
            ObjectMapper objectMapper,
            @Value("${payment.payos.client-id:}") String clientId,
            @Value("${payment.payos.api-key:}") String apiKey,
            @Value("${payment.payos.checksum-key:}") String checksumKey,
            @Value("${payment.payos.base-url:https://api-merchant.payos.vn}") String baseUrl,
            @Value("${payment.payos.return-url:http://localhost:3000/checkout/success}") String returnUrl,
            @Value("${payment.payos.cancel-url:http://localhost:3000/checkout/cancel}") String cancelUrl) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
        this.baseUrl = baseUrl;
        this.returnUrl = returnUrl;
        this.cancelUrl = cancelUrl;
    }

    @Override
    public PaymentProvider getProvider() {
        return PaymentProvider.PAYOS;
    }

    @Override
    public PaymentInitResult createPaymentLink(Payment payment, String description) {
        if (checksumKey == null || checksumKey.isBlank()) {
            throw ApiException.badRequest("PayOS checksum key is not configured. Please set PAYOS_CHECKSUM_KEY or use MOCK provider.");
        }

        String desc = description != null && !description.isBlank() ? description : "TicketNow order " + payment.getOrderCode();
        if (desc.length() > 25) {
            desc = desc.substring(0, 25);
        }

        String dataToSign = String.format("amount=%d&cancelUrl=%s&description=%s&orderCode=%d&returnUrl=%s",
                payment.getAmount(), cancelUrl, desc, payment.getOrderCode(), returnUrl);
        String signature = computeHmacSha256(dataToSign, checksumKey);

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("orderCode", payment.getOrderCode());
        requestBody.put("amount", payment.getAmount());
        requestBody.put("description", desc);
        requestBody.put("returnUrl", returnUrl);
        requestBody.put("cancelUrl", cancelUrl);
        requestBody.put("signature", signature);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri(baseUrl + "/v2/payment-requests")
                    .header("x-client-id", clientId)
                    .header("x-api-key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(Map.class);

            if (response == null || !"00".equals(String.valueOf(response.get("code")))) {
                String errorMsg = response != null ? String.valueOf(response.get("desc")) : "No response from PayOS";
                log.error("PayOS createPaymentLink error: {}", errorMsg);
                throw ApiException.badRequest("PayOS payment link creation failed: " + errorMsg);
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) response.get("data");
            String checkoutUrl = data != null ? String.valueOf(data.get("checkoutUrl")) : null;
            String qrCode = data != null ? String.valueOf(data.get("qrCode")) : null;
            String paymentLinkId = data != null ? String.valueOf(data.get("paymentLinkId")) : null;

            log.info("PayOS payment link created successfully for orderCode {}", payment.getOrderCode());
            return new PaymentInitResult(paymentLinkId, checkoutUrl, qrCode, paymentLinkId);

        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("PayOS communication failure for orderCode {}: {}", payment.getOrderCode(), ex.getMessage(), ex);
            throw ApiException.badRequest("PayOS connection error: " + ex.getMessage());
        }
    }

    @Override
    public PaymentWebhookResult verifyAndProcessWebhook(Map<String, Object> webhookBody, String signatureHeader) {
        if (webhookBody == null || !webhookBody.containsKey("data")) {
            return new PaymentWebhookResult(false, null, null, false, null, "Missing webhook data payload");
        }

        String providedSignature = (String) webhookBody.get("signature");
        if (providedSignature == null && signatureHeader != null) {
            providedSignature = signatureHeader;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) webhookBody.get("data");
        if (data == null) {
            return new PaymentWebhookResult(false, null, null, false, null, "Malformed webhook data");
        }

        // Verify HMAC signature
        if (checksumKey != null && !checksumKey.isBlank()) {
            String dataToSign = buildSortedQueryString(data);
            String expectedSignature = computeHmacSha256(dataToSign, checksumKey);

            if (providedSignature == null || !MessageDigest.isEqual(
                    providedSignature.getBytes(StandardCharsets.UTF_8),
                    expectedSignature.getBytes(StandardCharsets.UTF_8))) {
                log.warn("PayOS webhook signature mismatch! Expected: {}, Provided: {}", expectedSignature, providedSignature);
                return new PaymentWebhookResult(false, null, null, false, null, "Invalid webhook HMAC signature");
            }
        }

        Long orderCode = null;
        Object orderCodeObj = data.get("orderCode");
        if (orderCodeObj instanceof Number n) {
            orderCode = n.longValue();
        } else if (orderCodeObj != null) {
            orderCode = Long.parseLong(orderCodeObj.toString());
        }

        Long amount = null;
        Object amountObj = data.get("amount");
        if (amountObj instanceof Number n) {
            amount = n.longValue();
        } else if (amountObj != null) {
            amount = Long.parseLong(amountObj.toString());
        }

        String code = String.valueOf(data.get("code"));
        boolean success = "00".equals(code);
        String reference = String.valueOf(data.get("reference"));

        return new PaymentWebhookResult(true, orderCode, amount, success, reference, "Verified");
    }

    public static String computeHmacSha256(String data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception ex) {
            throw new RuntimeException("Failed to calculate HMAC-SHA256", ex);
        }
    }

    private String buildSortedQueryString(Map<String, Object> data) {
        List<String> sortedKeys = new ArrayList<>(data.keySet());
        Collections.sort(sortedKeys);

        StringBuilder sb = new StringBuilder();
        for (String k : sortedKeys) {
            Object val = data.get(k);
            if (val != null && !k.equalsIgnoreCase("signature")) {
                if (!sb.isEmpty()) {
                    sb.append("&");
                }
                sb.append(k).append("=").append(val);
            }
        }
        return sb.toString();
    }
}
