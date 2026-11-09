package com.minh.ticketservice.consumer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.ticketservice.dto.event.EventEnvelope;
import com.minh.ticketservice.dto.event.PaymentSucceededPayload;
import com.minh.ticketservice.entity.ProcessedEvent;
import com.minh.ticketservice.repository.ProcessedEventRepository;
import com.minh.ticketservice.service.TicketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "ticket.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class TicketPaymentEventListener {

    private static final String CONSUMER_NAME = "ticket-service";

    private final ProcessedEventRepository processedEventRepository;
    private final TicketService ticketService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    @Value("${booking.service.url:http://localhost:8084}")
    private String bookingServiceUrl;

    @KafkaListener(topics = "${payment.kafka.topic:payment.events}", groupId = "ticket-service")
    @Transactional
    public void onPaymentEvent(String record) {
        log.info("Ticket service received payment event: {}", record);
        try {
            JsonNode root = objectMapper.readTree(record);
            String eventId = root.path("eventId").asText();
            String eventType = root.path("type").asText();

            if (eventId == null || eventId.isBlank()) {
                log.warn("Missing eventId in payment event, ignoring: {}", record);
                return;
            }

            if (processedEventRepository.existsById(new com.minh.ticketservice.entity.ProcessedEventId(eventId, CONSUMER_NAME))) {
                log.info("Event {} already processed by {}, skipping duplicate", eventId, CONSUMER_NAME);
                return;
            }

            if ("PaymentSucceeded".equalsIgnoreCase(eventType)) {
                handlePaymentSucceeded(root);
            } else {
                log.debug("Ignoring event type {} in ticket-service", eventType);
            }

            processedEventRepository.save(new ProcessedEvent(eventId, CONSUMER_NAME, null));
        } catch (Exception e) {
            log.error("Failed to process payment event in ticket-service: {}", e.getMessage(), e);
        }
    }

    private void handlePaymentSucceeded(JsonNode root) {
        JsonNode payloadNode = root.path("payload");
        String bookingId = payloadNode.path("bookingId").asText();
        String userId = payloadNode.path("userId").asText();
        BigDecimal amount = BigDecimal.valueOf(payloadNode.path("amount").asDouble(0.0));
        String currency = payloadNode.path("currency").asText("VND");

        if (bookingId == null || bookingId.isBlank()) {
            log.warn("PaymentSucceeded event has no bookingId, cannot issue tickets");
            return;
        }

        // Attempt to fetch booking details from booking-service to get seat breakdown
        boolean issuedFromItems = false;
        try {
            String url = bookingServiceUrl + "/api/v1/bookings/" + bookingId;
            JsonNode bookingNode = restClient.get()
                    .uri(url)
                    .retrieve()
                    .body(JsonNode.class);

            if (bookingNode != null && bookingNode.has("items")) {
                String eventId = bookingNode.path("eventId").asText("evt-default");
                for (JsonNode item : bookingNode.path("items")) {
                    String seatId = item.path("seatId").asText("seat-gen");
                    String seatCode = item.path("seatCode").asText("S-GEN");
                    String tierName = item.path("tierName").asText("STANDARD");
                    BigDecimal price = BigDecimal.valueOf(item.path("price").asDouble(amount.doubleValue()));

                    ticketService.issueTicket(
                            bookingId,
                            eventId,
                            seatId,
                            seatCode,
                            tierName,
                            price,
                            currency,
                            userId
                    );
                }
                issuedFromItems = true;
            }
        } catch (Exception e) {
            log.warn("Could not fetch detailed booking items from booking-service: {}. Falling back to default ticket issuance.", e.getMessage());
        }

        if (!issuedFromItems) {
            // Fallback: issue single booking-level ticket
            ticketService.issueTicket(
                    bookingId,
                    "evt-" + bookingId.substring(0, Math.min(8, bookingId.length())),
                    "seat-" + bookingId.substring(0, Math.min(8, bookingId.length())),
                    "GA-01",
                    "General Admission",
                    amount,
                    currency,
                    userId
            );
        }
    }
}
