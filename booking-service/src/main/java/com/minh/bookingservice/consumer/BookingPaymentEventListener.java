package com.minh.bookingservice.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.bookingservice.entity.ProcessedEvent;
import com.minh.bookingservice.entity.ProcessedEventId;
import com.minh.bookingservice.repository.ProcessedEventRepository;
import com.minh.bookingservice.service.BookingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "booking.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class BookingPaymentEventListener {

    private static final String CONSUMER_GROUP = "booking-service";

    private final BookingService bookingService;
    private final ProcessedEventRepository processedEventRepository;
    private final ObjectMapper objectMapper;

    @KafkaListener(
            topics = "${booking.kafka.payment-events-topic:payment.events}",
            groupId = "${spring.kafka.consumer.group-id:booking-service}"
    )
    @Transactional
    public void onPaymentEvent(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventId = root.path("eventId").asText();
            String type = root.path("type").asText();
            String aggregateId = root.path("aggregateId").asText();

            if (eventId == null || eventId.isBlank()) {
                log.warn("Received payment event without eventId, skipping: {}", message);
                return;
            }

            ProcessedEventId processedId = new ProcessedEventId(eventId, CONSUMER_GROUP);
            if (processedEventRepository.existsById(processedId)) {
                log.info("Event {} already processed by {}, skipping duplicate", eventId, CONSUMER_GROUP);
                return;
            }

            log.info("Saga Consumer: received {} for booking {} (eventId: {})", type, aggregateId, eventId);

            if ("PaymentSucceeded".equalsIgnoreCase(type)) {
                bookingService.confirmBookingFromPayment(aggregateId);
                log.info("Saga: booking {} successfully confirmed via PaymentSucceeded event", aggregateId);
            } else if ("PaymentFailed".equalsIgnoreCase(type)) {
                bookingService.cancelBookingFromPayment(aggregateId);
                log.info("Saga: booking {} cancelled via PaymentFailed event", aggregateId);
            } else {
                log.debug("Ignored event type: {}", type);
            }

            processedEventRepository.save(ProcessedEvent.builder()
                    .eventId(eventId)
                    .consumerGroup(CONSUMER_GROUP)
                    .processedAt(Instant.now())
                    .build());

        } catch (Exception ex) {
            log.error("Failed to process payment event {}: {}", message, ex.getMessage(), ex);
            throw new RuntimeException("Payment event processing failed", ex);
        }
    }
}
