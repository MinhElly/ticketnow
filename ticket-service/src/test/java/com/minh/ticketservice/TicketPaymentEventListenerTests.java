package com.minh.ticketservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.ticketservice.consumer.TicketPaymentEventListener;
import com.minh.ticketservice.dto.event.EventEnvelope;
import com.minh.ticketservice.dto.event.PaymentSucceededPayload;
import com.minh.ticketservice.entity.Ticket;
import com.minh.ticketservice.repository.ProcessedEventRepository;
import com.minh.ticketservice.repository.TicketRepository;
import com.minh.ticketservice.service.TicketService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ticketconsumertest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "minio.enabled=false",
        "ticket.kafka.enabled=false",
        "ticket.outbox.relay.enabled=false"
})
@Transactional
@Import(TicketPaymentEventListenerTests.TestConfig.class)
class TicketPaymentEventListenerTests {

    @Autowired
    TicketPaymentEventListener listener;

    @Autowired
    TicketRepository ticketRepository;

    @Autowired
    ProcessedEventRepository processedEventRepository;

    @Autowired
    ObjectMapper objectMapper;

    @TestConfiguration
    static class TestConfig {
        @Bean
        JwtDecoder jwtDecoder() {
            return Mockito.mock(JwtDecoder.class);
        }

        @Bean
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, String> kafkaTemplate() {
            return Mockito.mock(KafkaTemplate.class);
        }

        @Bean
        TicketPaymentEventListener ticketPaymentEventListener(
                ProcessedEventRepository processedEventRepository,
                TicketService ticketService,
                ObjectMapper objectMapper,
                org.springframework.web.client.RestClient restClient) {
            return new TicketPaymentEventListener(processedEventRepository, ticketService, objectMapper, restClient);
        }
    }

    @Test
    void shouldIssueTicketOnPaymentSucceededAndDeduplicateReplay() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String bookingId = "bkg-listener-01";

        PaymentSucceededPayload payload = new PaymentSucceededPayload(
                "pay-01",
                bookingId,
                "user-listener-01",
                BigDecimal.valueOf(350000),
                "VND",
                "MOCK",
                "TXN-01",
                123456789L
        );

        EventEnvelope<PaymentSucceededPayload> envelope = new EventEnvelope<>(
                eventId,
                "PaymentSucceeded",
                1,
                Instant.now(),
                bookingId,
                "trace-01",
                payload
        );

        String json = objectMapper.writeValueAsString(envelope);

        // 1st delivery
        listener.onPaymentEvent(json);

        List<Ticket> tickets = ticketRepository.findByBookingId(bookingId);
        assertThat(tickets).hasSize(1);
        assertThat(tickets.get(0).getUserId()).isEqualTo("user-listener-01");
        assertThat(tickets.get(0).getTicketCode()).startsWith("TKT-");

        // 2nd delivery (duplicate replay)
        listener.onPaymentEvent(json);

        List<Ticket> ticketsAfterReplay = ticketRepository.findByBookingId(bookingId);
        assertThat(ticketsAfterReplay).hasSize(1); // Deduped, no second ticket created
    }
}
