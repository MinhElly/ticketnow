package com.minh.bookingservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.bookingservice.client.SeatInventoryClient;
import com.minh.bookingservice.consumer.BookingPaymentEventListener;
import com.minh.bookingservice.entity.Booking;
import com.minh.bookingservice.entity.ProcessedEventId;
import com.minh.bookingservice.enums.BookingStatus;
import com.minh.bookingservice.repository.BookingRepository;
import com.minh.bookingservice.repository.ProcessedEventRepository;
import com.minh.bookingservice.service.BookingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:bookinglistenertest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "seat-inventory.client=none",
        "booking.kafka.enabled=false"
})
@Transactional
@Import(BookingPaymentEventListenerTests.TestConfig.class)
class BookingPaymentEventListenerTests {

    @Autowired
    BookingPaymentEventListener listener;

    @Autowired
    BookingRepository bookingRepository;

    @Autowired
    ProcessedEventRepository processedEventRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    SeatInventoryClient seatInventoryClient;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        @Primary
        SeatInventoryClient seatInventoryClient() {
            return Mockito.mock(SeatInventoryClient.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return value -> {
                throw new BadJwtException("Invalid token");
            };
        }

        @Bean
        BookingPaymentEventListener bookingPaymentEventListener(
                BookingService bookingService,
                ProcessedEventRepository processedEventRepository,
                ObjectMapper objectMapper) {
            return new BookingPaymentEventListener(bookingService, processedEventRepository, objectMapper);
        }
    }

    @BeforeEach
    void setUp() {
        Mockito.reset(seatInventoryClient);
    }

    @Test
    void testPaymentSucceeded_ConfirmsBooking_AndRecordsProcessedEvent() throws Exception {
        Booking booking = Booking.builder()
                .id("bkg-saga-001")
                .userId("customer-1")
                .eventId("evt-1")
                .status(BookingStatus.AWAITING_PAYMENT)
                .totalAmount(new BigDecimal("200000.00"))
                .idempotencyKey("idem-saga-1")
                .expiresAt(Instant.now().plusSeconds(600))
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
        bookingRepository.save(booking);

        Map<String, Object> event = Map.of(
                "eventId", "evt-pay-12345",
                "type", "PaymentSucceeded",
                "version", 1,
                "occurredAt", Instant.now().toString(),
                "aggregateId", "bkg-saga-001",
                "payload", Map.of("orderCode", 99887766L, "amount", 200000L)
        );

        String messageJson = objectMapper.writeValueAsString(event);
        listener.onPaymentEvent(messageJson);

        Booking updated = bookingRepository.findById("bkg-saga-001").orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(BookingStatus.CONFIRMED);

        // Verify seat-inventory confirm was called via client
        Mockito.verify(seatInventoryClient).confirmSeats(Mockito.eq("evt-1"), Mockito.anyList(), Mockito.eq("bkg-saga-001"));

        // Verify idempotent processed event record
        assertThat(processedEventRepository.existsById(new ProcessedEventId("evt-pay-12345", "booking-service"))).isTrue();

        // Replaying same event should be a no-op
        Mockito.clearInvocations(seatInventoryClient);
        listener.onPaymentEvent(messageJson);
        Mockito.verifyNoInteractions(seatInventoryClient);
    }
}
