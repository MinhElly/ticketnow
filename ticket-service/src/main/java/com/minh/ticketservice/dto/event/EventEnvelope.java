package com.minh.ticketservice.dto.event;

import java.time.Instant;

public record EventEnvelope<T>(
        String eventId,
        String type,
        int version,
        Instant occurredAt,
        String aggregateId,
        String traceId,
        T payload
) {}
