package com.minh.paymentservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.paymentservice.dto.request.CreatePaymentRequest;
import com.minh.paymentservice.entity.OutboxMessage;
import com.minh.paymentservice.entity.Payment;
import com.minh.paymentservice.enums.PaymentStatus;
import com.minh.paymentservice.repository.OutboxRepository;
import com.minh.paymentservice.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:paymentflowtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "payment.gateway.provider=mock",
        "payment.outbox.enabled=false"
})
@Transactional
@Import(PaymentFlowTests.TestConfig.class)
class PaymentFlowTests {

    @Autowired
    WebApplicationContext context;

    @Autowired
    PaymentRepository paymentRepository;

    @Autowired
    OutboxRepository outboxRepository;

    @Autowired
    ObjectMapper objectMapper;

    MockMvc mvc;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, String> kafkaTemplate() {
            return Mockito.mock(KafkaTemplate.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return token -> {
                String role = switch (token) {
                    case "admin" -> "admin";
                    case "organizer" -> "organizer";
                    default -> {
                        if (token.startsWith("customer")) yield "customer";
                        throw new BadJwtException("Invalid token: " + token);
                    }
                };

                return Jwt.withTokenValue(token)
                        .header("alg", "none")
                        .subject(token)
                        .claim("sub", token)
                        .claim("realm_access", Map.of("roles", List.of(role)))
                        .issuedAt(Instant.now())
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .build();
            };
        }
    }

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void testCreatePayment_Success() throws Exception {
        CreatePaymentRequest request = CreatePaymentRequest.builder()
                .bookingId("bkg-test-01")
                .amount(250000L)
                .description("2 seats ticket")
                .provider("MOCK")
                .build();

        mvc.perform(post("/api/v1/payments")
                        .header("Authorization", "Bearer customer-123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.bookingId").value("bkg-test-01"))
                .andExpect(jsonPath("$.amount").value(250000))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.provider").value("MOCK"))
                .andExpect(jsonPath("$.checkoutUrl").isNotEmpty())
                .andExpect(jsonPath("$.qrCode").isNotEmpty());
    }

    @Test
    void testCreatePayment_Unauthorized() throws Exception {
        CreatePaymentRequest request = CreatePaymentRequest.builder()
                .bookingId("bkg-test-02")
                .amount(100000L)
                .build();

        mvc.perform(post("/api/v1/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testGetPayment_ForbiddenForOtherUser() throws Exception {
        Payment p = Payment.builder()
                .id("pmt-owner-test")
                .bookingId("bkg-001")
                .userId("customer-owner")
                .orderCode(111222333L)
                .amount(50000L)
                .currency("VND")
                .status(PaymentStatus.PENDING)
                .provider(com.minh.paymentservice.enums.PaymentProvider.MOCK)
                .build();
        paymentRepository.save(p);

        // Access with a different user
        mvc.perform(get("/api/v1/payments/pmt-owner-test")
                        .header("Authorization", "Bearer customer-intruder"))
                .andExpect(status().isForbidden());

        // Access with the real owner
        mvc.perform(get("/api/v1/payments/pmt-owner-test")
                        .header("Authorization", "Bearer customer-owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("pmt-owner-test"));
    }

    @Test
    void testWebhook_ValidPayment_UpdatesToPaid_AndEmitsOutbox() throws Exception {
        Payment p = Payment.builder()
                .id("pmt-webhook-test")
                .bookingId("bkg-webhook-1")
                .userId("customer-123")
                .orderCode(9988776655L)
                .amount(300000L)
                .currency("VND")
                .status(PaymentStatus.PENDING)
                .provider(com.minh.paymentservice.enums.PaymentProvider.MOCK)
                .build();
        paymentRepository.save(p);

        Map<String, Object> webhookPayload = Map.of(
                "orderCode", 9988776655L,
                "amount", 300000L,
                "status", "PAID"
        );

        // Webhook is public (no Bearer token needed)
        mvc.perform(post("/api/v1/payments/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(webhookPayload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.error").value(0));

        Payment updated = paymentRepository.findById("pmt-webhook-test").orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(updated.getPaidAt()).isNotNull();

        // Verify outbox message was written
        List<OutboxMessage> outbox = outboxRepository.findAll();
        assertThat(outbox).anyMatch(msg -> "PaymentSucceeded".equals(msg.getEventType()) &&
                "bkg-webhook-1".equals(msg.getAggregateId()));

        // Second call (idempotent replay) should succeed without error
        mvc.perform(post("/api/v1/payments/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(webhookPayload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Already processed"));
    }

    @Test
    void testSimulateSuccess_Endpoint() throws Exception {
        Payment p = Payment.builder()
                .id("pmt-sim-test")
                .bookingId("bkg-sim-1")
                .userId("customer-123")
                .orderCode(5544332211L)
                .amount(120000L)
                .currency("VND")
                .status(PaymentStatus.PENDING)
                .provider(com.minh.paymentservice.enums.PaymentProvider.MOCK)
                .build();
        paymentRepository.save(p);

        mvc.perform(post("/api/v1/payments/mock/simulate-success/5544332211"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty());

        Payment updated = paymentRepository.findById("pmt-sim-test").orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(PaymentStatus.PAID);
    }
}
