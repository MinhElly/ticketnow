package com.minh.eventservice.service;

import com.minh.eventservice.dto.request.EventRequest;
import com.minh.eventservice.dto.response.EventResponse;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.entity.Event;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.exception.ApiException;
import com.minh.eventservice.repository.EventRepository;
import com.minh.eventservice.repository.TicketTierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventService {
    private final EventRepository events;
    private final VenueService venues;
    private final TicketTierRepository tiers;

    public Event require(String id) {
        return events.findById(id).orElseThrow(() -> ApiException.notFound("Event"));
    }

    public void requireDraft(Event e) {
        if (e.getStatus() != EventStatus.DRAFT) throw ApiException.conflict("Only draft events can be modified");
    }

    public EventResponse get(String id) {
        return EventResponse.from(require(id));
    }

    public PageResponse<EventResponse> list(int page, int size) {
        return PageResponse.from(events.findAll(PageRequest.of(page, size, Sort.by("startsAt").and(Sort.by("id")))).map(EventResponse::from));
    }

    private void apply(Event e, EventRequest r) {
        if (!r.endsAt().isAfter(r.startsAt()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "endsAt must be after startsAt");
        e.setTitle(r.title().trim());
        e.setDescription(r.description());
        e.setVenue(venues.require(r.venueId()));
        e.setStartsAt(r.startsAt());
        e.setEndsAt(r.endsAt());
    }

    @Transactional
    public EventResponse create(EventRequest r) {
        Event e = new Event();
        apply(e, r);
        e.setOrganizerId("local-development");
        return EventResponse.from(events.saveAndFlush(e));
    }

    @Transactional
    public EventResponse update(String id, EventRequest r) {
        Event e = require(id);
        requireDraft(e);
        apply(e, r);
        return EventResponse.from(events.saveAndFlush(e));
    }

    @Transactional
    public void delete(String id) {
        Event e = require(id);
        requireDraft(e);
        tiers.deleteAll(tiers.findByEventIdOrderByPriceAsc(id));
        tiers.flush();
        events.delete(e);
    }
}

