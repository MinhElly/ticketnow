package com.minh.eventservice.service;

import com.minh.eventservice.dto.request.TicketTierRequest;
import com.minh.eventservice.dto.response.TicketTierResponse;
import com.minh.eventservice.entity.Event;
import com.minh.eventservice.entity.TicketTier;
import com.minh.eventservice.exception.ApiException;
import com.minh.eventservice.repository.SeatSectionRepository;
import com.minh.eventservice.repository.TicketTierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TicketTierService {
    private final TicketTierRepository tiers;
    private final SeatSectionRepository sections;
    private final EventService events;

    public List<TicketTierResponse> list(String eventId) {
        events.requireReadable(events.require(eventId));
        return tiers.findByEventIdOrderByPriceAsc(eventId).stream().map(TicketTierResponse::from).toList();
    }

    public TicketTierResponse get(String eventId, String id) {
        events.requireReadable(events.require(eventId));
        return TicketTierResponse.from(require(eventId, id));
    }

    private TicketTier require(String eventId, String id) {
        return tiers.findById(id).filter(t -> t.getEvent().getId().equals(eventId)).orElseThrow(() -> ApiException.notFound("Ticket tier"));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public TicketTierResponse create(String eventId, TicketTierRequest r) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);
        if (tiers.existsByEventIdAndNameIgnoreCase(eventId, r.name().trim()))
            throw ApiException.conflict("Ticket tier name already exists");
        TicketTier t = new TicketTier();
        t.setEvent(e);
        apply(t, r);
        return TicketTierResponse.from(tiers.saveAndFlush(t));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public TicketTierResponse update(String eventId, String id, TicketTierRequest r) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);
        TicketTier t = require(eventId, id);
        if (!t.getName().equalsIgnoreCase(r.name().trim()) && tiers.existsByEventIdAndNameIgnoreCase(eventId, r.name().trim()))
            throw ApiException.conflict("Ticket tier name already exists");
        apply(t, r);
        return TicketTierResponse.from(tiers.saveAndFlush(t));
    }

    private void apply(TicketTier t, TicketTierRequest r) {
        t.setName(r.name().trim());
        t.setPrice(r.price());
        t.setCurrency(r.currency());
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public void delete(String eventId, String id) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);
        if (sections.existsByTierId(id)) {
            throw ApiException.conflict("Cannot delete ticket tier that is in use by a seat section");
        }
        tiers.delete(require(eventId, id));
    }
}
