package com.minh.paymentservice.service;

import com.minh.paymentservice.entity.OutboxMessage;
import com.minh.paymentservice.repository.OutboxRepository;
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
@ConditionalOnProperty(name = "payment.outbox.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxRelayService {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${payment.kafka.topic:payment.events}")
    private String topicName;

    @Scheduled(fixedDelayString = "${payment.outbox.fixed-delay-ms:1000}", initialDelay = 3000)
    @Transactional
    public void relayPendingEvents() {
        List<OutboxMessage> pending = outboxRepository.findPendingMessages(PageRequest.of(0, 50));
        if (pending.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        int publishedCount = 0;

        for (OutboxMessage msg : pending) {
            try {
                // Key = aggregateId (bookingId) ensures in-order delivery per booking in Kafka
                kafkaTemplate.send(topicName, msg.getAggregateId(), msg.getPayload());
                msg.setPublishedAt(now);
                outboxRepository.save(msg);
                publishedCount++;
            } catch (Exception ex) {
                log.warn("Failed to publish outbox message {} to Kafka topic {}: {}. Will retry.",
                        msg.getId(), topicName, ex.getMessage());
                break; // Stop batch on broker error to preserve order
            }
        }

        if (publishedCount > 0) {
            log.info("Relayed {} outbox messages to Kafka topic {}", publishedCount, topicName);
        }
    }
}
