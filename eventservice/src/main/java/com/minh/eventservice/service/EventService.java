package com.minh.eventservice.service;

import com.minh.eventservice.config.CurrentUser;
import com.minh.eventservice.dto.request.EventRequest;
import com.minh.eventservice.dto.response.EventResponse;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.entity.Event;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.exception.ApiException;
import com.minh.eventservice.repository.EventRepository;
import com.minh.eventservice.repository.SeatSectionRepository;
import com.minh.eventservice.repository.TicketTierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventService {
    private final EventRepository events;
    private final VenueService venues;
    private final TicketTierRepository tiers;
    private final SeatSectionRepository sections;
    private final CurrentUser currentUser;

    public void requireOwnerOrAdmin(Event event){
        if(!currentUser.isAdmin() && !currentUser.subject().equals(event.getOrganizerId())){
            throw new AccessDeniedException("You do not have permission to perform this event");
        }
    }
    public void requireReadable(Event event){
        boolean publiclyVisible = event.getStatus() == EventStatus.PUBLISHED || event.getStatus() == EventStatus.ON_SALE || event.getStatus() == EventStatus.CLOSED;
        if(!publiclyVisible){
            requireOwnerOrAdmin(event);
        }
    }
    public Event require(String id) {
        return events.findById(id).orElseThrow(() -> ApiException.notFound("Event"));
    }

    public void requireDraft(Event e) {
        if (e.getStatus() != EventStatus.DRAFT) throw ApiException.conflict("Only draft events can be modified");
    }

    public EventResponse get(String id) {
        Event event = require(id);
        requireReadable(event);
        return EventResponse.from(event);
    }

    public PageResponse<EventResponse> list(int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("startsAt").and(Sort.by("id")));
        var statuses = List.of(EventStatus.PUBLISHED, EventStatus.ON_SALE, EventStatus.CLOSED);

        return PageResponse.from(events.findByStatusIn(statuses, pageable).map(EventResponse::from));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    public PageResponse<EventResponse> listMine(int page, int size, EventStatus status) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id")));
        String organizerId = currentUser.subject();
        Page<Event> result = (status != null)
                ? events.findByOrganizerIdAndStatus(organizerId, status, pageable)
                : events.findByOrganizerId(organizerId, pageable);
        return PageResponse.from(result.map(EventResponse::from));
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
    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse create(EventRequest r) {
        Event e = new Event();
        apply(e, r);
        e.setOrganizerId(currentUser.subject());
        return EventResponse.from(events.saveAndFlush(e));
    }
    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse update(String id, EventRequest r) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        requireDraft(e);
        apply(e, r);
        return EventResponse.from(events.saveAndFlush(e));
    }
    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public void delete(String id) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        requireDraft(e);
        sections.deleteAll(sections.findByEventIdOrderByNameAsc(id));
        sections.flush();
        tiers.deleteAll(tiers.findByEventIdOrderByPriceAsc(id));
        tiers.flush();
        events.delete(e);
    }
}
