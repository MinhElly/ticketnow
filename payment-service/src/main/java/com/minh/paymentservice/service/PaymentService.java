package com.minh.paymentservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.paymentservice.dto.event.EventEnvelope;
import com.minh.paymentservice.dto.event.PaymentFailedPayload;
import com.minh.paymentservice.dto.event.PaymentSucceededPayload;
import com.minh.paymentservice.dto.request.CreatePaymentRequest;
import com.minh.paymentservice.dto.response.PaymentResponse;
import com.minh.paymentservice.entity.OutboxMessage;
import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentProvider;
import com.minh.paymentservice.enums.PaymentStatus;
import com.minh.paymentservice.exception.ApiException;
import com.minh.paymentservice.gateway.PaymentGatewayAdapter;
import com.minh.paymentservice.gateway.PaymentGatewayFactory;
import com.minh.paymentservice.gateway.PaymentInitResult;
import com.minh.paymentservice.gateway.PaymentWebhookResult;
import com.minh.paymentservice.repository.OutboxRepository;
import com.minh.paymentservice.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final OutboxRepository outboxRepository;
    private final PaymentGatewayFactory gatewayFactory;
    private final ObjectMapper objectMapper;

    @Transactional
    public PaymentResponse createPayment(CreatePaymentRequest request, String userId) {
        PaymentProvider provider = gatewayFactory.getDefaultProvider();
        if (request.getProvider() != null && !request.getProvider().isBlank()) {
            try {
                provider = PaymentProvider.valueOf(request.getProvider().trim().toUpperCase());
            } catch (Exception ignored) {
            }
        }

        PaymentGatewayAdapter adapter = gatewayFactory.getAdapter(provider);
        long orderCode = generateOrderCode();
        String paymentId = UUID.randomUUID().toString();

        Payment payment = Payment.builder()
                .id(paymentId)
                .bookingId(request.getBookingId())
                .userId(userId)
                .orderCode(orderCode)
                .amount(request.getAmount())
                .currency("VND")
                .status(PaymentStatus.PENDING)
                .provider(adapter.getProvider())
                .build();

        payment = paymentRepository.save(payment);

        PaymentInitResult initResult = adapter.createPaymentLink(payment, request.getDescription());
        payment.setPaymentLinkId(initResult.paymentLinkId());
        payment.setCheckoutUrl(initResult.checkoutUrl());
        payment.setQrCode(initResult.qrCode());
        payment = paymentRepository.save(payment);

        log.info("Created payment {} for booking {} with provider {}, orderCode {}",
                payment.getId(), payment.getBookingId(), payment.getProvider(), payment.getOrderCode());

        return toResponse(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPayment(String id, String currentUserId, boolean isAdmin) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Payment"));

        if (!isAdmin && !payment.getUserId().equals(currentUserId)) {
            throw ApiException.forbidden("You do not have access to this payment");
        }

        return toResponse(payment);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getPaymentsByBooking(String bookingId, String currentUserId, boolean isAdmin) {
        List<Payment> list = paymentRepository.findByBookingId(bookingId);
        if (!isAdmin) {
            list = list.stream().filter(p -> p.getUserId().equals(currentUserId)).toList();
        }
        return list.stream().map(this::toResponse).toList();
    }

    @Transactional
    public Map<String, Object> handleWebhook(Map<String, Object> body, String signatureHeader) {
        // Try verifying with PayOS first; if not, try with Mock
        PaymentGatewayAdapter payOsAdapter = gatewayFactory.getAdapter(PaymentProvider.PAYOS);
        PaymentWebhookResult result = payOsAdapter.verifyAndProcessWebhook(body, signatureHeader);

        if (!result.verified()) {
            PaymentGatewayAdapter mockAdapter = gatewayFactory.getAdapter(PaymentProvider.MOCK);
            result = mockAdapter.verifyAndProcessWebhook(body, signatureHeader);
        }

        if (!result.verified()) {
            log.warn("Webhook verification failed: {}", result.message());
            throw ApiException.badRequest("Webhook verification failed: " + result.message());
        }

        if (result.orderCode() == null) {
            throw ApiException.badRequest("OrderCode is missing from webhook payload");
        }

        final Long targetOrderCode = result.orderCode();
        Payment payment = paymentRepository.findByOrderCode(targetOrderCode)
                .orElseThrow(() -> ApiException.notFound("Payment for orderCode " + targetOrderCode));

        if (payment.getStatus() == PaymentStatus.PAID) {
            log.info("Payment for orderCode {} is already PAID. Webhook is idempotent no-op.", result.orderCode());
            return Map.of("error", 0, "message", "Already processed");
        }

        Instant now = Instant.now();
        if (result.success()) {
            payment.setStatus(PaymentStatus.PAID);
            payment.setPaidAt(now);
            paymentRepository.save(payment);

            // Record outbox event: PaymentSucceeded
            PaymentSucceededPayload payload = PaymentSucceededPayload.builder()
                    .paymentId(payment.getId())
                    .bookingId(payment.getBookingId())
                    .userId(payment.getUserId())
                    .orderCode(payment.getOrderCode())
                    .amount(payment.getAmount())
                    .currency(payment.getCurrency())
                    .provider(payment.getProvider())
                    .paidAt(now)
                    .transactionReference(result.transactionReference())
                    .build();

            createOutboxMessage("PaymentSucceeded", payment.getBookingId(), payload);
            log.info("Payment {} (booking {}) marked as PAID and PaymentSucceeded outbox emitted",
                    payment.getId(), payment.getBookingId());

        } else {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason(result.message());
            paymentRepository.save(payment);

            PaymentFailedPayload payload = PaymentFailedPayload.builder()
                    .paymentId(payment.getId())
                    .bookingId(payment.getBookingId())
                    .orderCode(payment.getOrderCode())
                    .amount(payment.getAmount())
                    .currency(payment.getCurrency())
                    .provider(payment.getProvider())
                    .reason(result.message())
                    .failedAt(now)
                    .build();

            createOutboxMessage("PaymentFailed", payment.getBookingId(), payload);
            log.warn("Payment {} (booking {}) marked as FAILED: {}", payment.getId(), payment.getBookingId(), result.message());
        }

        return Map.of("error", 0, "message", "Webhook processed successfully");
    }

    @Transactional
    public PaymentResponse simulateSuccess(Long orderCode) {
        Payment payment = paymentRepository.findByOrderCode(orderCode)
                .orElseThrow(() -> ApiException.notFound("Payment with orderCode " + orderCode));

        if (payment.getStatus() != PaymentStatus.PAID) {
            Instant now = Instant.now();
            payment.setStatus(PaymentStatus.PAID);
            payment.setPaidAt(now);
            paymentRepository.save(payment);

            PaymentSucceededPayload payload = PaymentSucceededPayload.builder()
                    .paymentId(payment.getId())
                    .bookingId(payment.getBookingId())
                    .userId(payment.getUserId())
                    .orderCode(payment.getOrderCode())
                    .amount(payment.getAmount())
                    .currency(payment.getCurrency())
                    .provider(payment.getProvider())
                    .paidAt(now)
                    .transactionReference("SIMULATED_" + orderCode)
                    .build();

            createOutboxMessage("PaymentSucceeded", payment.getBookingId(), payload);
            log.info("Simulated payment success for orderCode {}", orderCode);
        }

        return toResponse(payment);
    }

    private void createOutboxMessage(String eventType, String aggregateId, Object payload) {
        try {
            EventEnvelope<Object> envelope = EventEnvelope.builder()
                    .type(eventType)
                    .version(1)
                    .occurredAt(Instant.now())
                    .aggregateId(aggregateId)
                    .payload(payload)
                    .build();

            String json = objectMapper.writeValueAsString(envelope);
            OutboxMessage msg = OutboxMessage.builder()
                    .id(UUID.randomUUID().toString())
                    .aggregateType("BOOKING")
                    .aggregateId(aggregateId)
                    .eventType(eventType)
                    .payload(json)
                    .build();

            outboxRepository.save(msg);
        } catch (Exception ex) {
            log.error("Failed to serialize outbox message for aggregate {}: {}", aggregateId, ex.getMessage(), ex);
            throw new RuntimeException("Outbox serialization failure", ex);
        }
    }

    private long generateOrderCode() {
        // PayOS requires integer orderCode between 1 and 9007199254740991.
        // We use current epoch seconds (10 digits) + 4 random digits = 14 digits.
        long epochSeconds = Instant.now().getEpochSecond();
        int randomSuffix = ThreadLocalRandom.current().nextInt(1000, 9999);
        return (epochSeconds * 10000) + randomSuffix;
    }

    public PaymentResponse toResponse(Payment p) {
        return PaymentResponse.builder()
                .id(p.getId())
                .bookingId(p.getBookingId())
                .userId(p.getUserId())
                .orderCode(p.getOrderCode())
                .amount(p.getAmount())
                .currency(p.getCurrency())
                .status(p.getStatus())
                .provider(p.getProvider())
                .paymentLinkId(p.getPaymentLinkId())
                .checkoutUrl(p.getCheckoutUrl())
                .qrCode(p.getQrCode())
                .failureReason(p.getFailureReason())
                .paidAt(p.getPaidAt())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }
}
