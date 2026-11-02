package com.minh.eventservice.dto.response;

import com.minh.eventservice.entity.TicketTier;

import java.math.BigDecimal;

public record TicketTierResponse(String id, String eventId, String name, BigDecimal price, String currency) {
    public static TicketTierResponse from(TicketTier t) {
        return new TicketTierResponse(t.getId(), t.getEvent().getId(), t.getName(), t.getPrice(), t.getCurrency());
    }
}

