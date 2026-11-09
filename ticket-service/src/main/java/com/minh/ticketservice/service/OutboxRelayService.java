package com.minh.ticketservice.service;

import com.minh.ticketservice.entity.OutboxMessage;
import com.minh.ticketservice.repository.OutboxRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "ticket.outbox.relay.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxRelayService {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${ticket.kafka.topic:ticket.events}")
    private String topicName;

    @Scheduled(fixedDelayString = "${ticket.outbox.relay.fixed-delay-ms:3000}")
    @Transactional
    public void relayPendingEvents() {
        List<OutboxMessage> pending = outboxRepository.findTopByStatusOrderByCreatedAtAsc("PENDING", PageRequest.of(0, 50));
        if (pending.isEmpty()) {
            return;
        }

        log.info("Relaying {} pending ticket outbox events to Kafka topic {}", pending.size(), topicName);
        for (OutboxMessage message : pending) {
            try {
                kafkaTemplate.send(topicName, message.getAggregateId(), message.getPayload())
                        .whenComplete((result, ex) -> {
                            if (ex != null) {
                                log.error("Failed to publish ticket event {}: {}", message.getId(), ex.getMessage());
                            } else {
                                log.debug("Published ticket event {} to partition {}", message.getId(), result.getRecordMetadata().partition());
                            }
                        });

                message.setStatus("PROCESSED");
                message.setProcessedAt(Instant.now());
                outboxRepository.save(message);
            } catch (Exception e) {
                log.error("Error processing ticket outbox message {}: {}", message.getId(), e.getMessage());
                message.setRetryCount(message.getRetryCount() + 1);
                outboxRepository.save(message);
            }
        }
    }
}
