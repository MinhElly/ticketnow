package com.minh.paymentservice.dto.event;

import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventEnvelope<T> {
    @Builder.Default
    private String eventId = UUID.randomUUID().toString();
    private String type;
    @Builder.Default
    private int version = 1;
    @Builder.Default
    private Instant occurredAt = Instant.now();
    private String aggregateId;
    private String traceId;
    private T payload;
}
