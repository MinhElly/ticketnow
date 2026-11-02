package com.minh.eventservice.dto.response;

import com.minh.eventservice.entity.Event;
import com.minh.eventservice.enums.EventStatus;

import java.time.Instant;

public record EventResponse(String id, String title, String description, String venueId, String organizerId,
                            Instant startsAt, Instant endsAt, EventStatus status, long version) {
    public static EventResponse from(Event e) {
        return new EventResponse(e.getId(), e.getTitle(), e.getDescription(), e.getVenue().getId(), e.getOrganizerId(), e.getStartsAt(), e.getEndsAt(), e.getStatus(), e.getVersion());
    }
}

