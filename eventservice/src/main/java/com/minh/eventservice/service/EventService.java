package com.minh.eventservice.service;

import com.minh.eventservice.client.SeatInventoryClient;
import com.minh.eventservice.client.SeatSpec;
import com.minh.eventservice.config.CurrentUser;
import com.minh.eventservice.dto.request.EventRequest;
import com.minh.eventservice.dto.response.EventResponse;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.entity.Event;
import com.minh.eventservice.entity.SeatSection;
import com.minh.eventservice.entity.TicketTier;
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

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventService {
    private final EventRepository events;
    private final VenueService venues;
    private final TicketTierRepository tiers;
    private final SeatSectionRepository sections;
    private final CurrentUser currentUser;
    private final SeatInventoryClient seatInventoryClient;

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
    public Event require(String idOrSlug) {
        return events.findById(idOrSlug)
                .or(() -> events.findBySlug(idOrSlug))
                .orElseThrow(() -> ApiException.notFound("Event"));
    }

    public void requireDraft(Event e) {
        if (e.getStatus() != EventStatus.DRAFT) throw ApiException.conflict("Only draft events can be modified");
    }

    public Integer getTotalConfiguredSeats(String eventId) {
        return sections.findByEventIdOrderByNameAsc(eventId).stream()
                .mapToInt(s -> s.getRowCount() * s.getSeatsPerRow())
                .sum();
    }

    public BigDecimal getLowestPrice(String eventId) {
        var tierList = tiers.findByEventIdOrderByPriceAsc(eventId);
        return tierList.isEmpty() ? null : tierList.get(0).getPrice();
    }

    private EventResponse toResponse(Event e) {
        return EventResponse.from(e, getTotalConfiguredSeats(e.getId()), getLowestPrice(e.getId()));
    }

    public EventResponse get(String id) {
        Event event = require(id);
        requireReadable(event);
        return toResponse(event);
    }

    public PageResponse<EventResponse> list(int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("startsAt").and(Sort.by("id")));
        var statuses = List.of(EventStatus.PUBLISHED, EventStatus.ON_SALE, EventStatus.CLOSED);

        return PageResponse.from(events.findByStatusIn(statuses, pageable).map(this::toResponse));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    public PageResponse<EventResponse> listMine(int page, int size, EventStatus status) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id")));
        String organizerId = currentUser.subject();

        Page<Event> eventPage = (status != null)
                ? events.findByOrganizerIdAndStatus(organizerId, status, pageable)
                : events.findByOrganizerId(organizerId, pageable);

        return PageResponse.from(eventPage.map(this::toResponse));
    }

    private void apply(Event e, EventRequest r) {
        if (!r.endsAt().isAfter(r.startsAt()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "endsAt must be after startsAt");
        e.setTitle(r.title().trim());
        e.setDescription(r.description());
        e.setVenue(venues.require(r.venueId()));
        e.setStartsAt(r.startsAt());
        e.setEndsAt(r.endsAt());
        if (r.category() != null) e.setCategory(r.category().trim());
        if (r.imageUrl() != null) e.setImageUrl(r.imageUrl().trim());
        if (r.slug() != null && !r.slug().isBlank()) {
            String trimmedSlug = r.slug().trim();
            if (!trimmedSlug.equals(e.getSlug()) && events.existsBySlug(trimmedSlug)) {
                throw new ApiException(HttpStatus.CONFLICT, "Slug already exists");
            }
            e.setSlug(trimmedSlug);
        } else if (e.getSlug() == null) {
            e.setSlug(generateSlug(e.getTitle(), e.getId()));
        }
    }

    private String generateSlug(String title, String id) {
        String base = java.text.Normalizer.normalize(title, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .toLowerCase()
                .replaceAll("[đĐ]", "d")
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        if (base.isBlank()) {
            return id != null ? id : UUID.randomUUID().toString();
        }
        if (events.existsBySlug(base)) {
            return base + "-" + (id != null ? id.substring(0, 8) : UUID.randomUUID().toString().substring(0, 8));
        }
        return base;
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse create(EventRequest r) {
        Event e = new Event();
        apply(e, r);
        e.setOrganizerId(currentUser.subject());
        return toResponse(events.saveAndFlush(e));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse update(String id, EventRequest r) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        requireDraft(e);
        apply(e, r);
        return toResponse(events.saveAndFlush(e));
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

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse publish(String id) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        requireDraft(e);

        if (!e.getEndsAt().isAfter(e.getStartsAt())) {
            throw ApiException.badRequest("Event endsAt must be strictly after startsAt");
        }
        var tierList = tiers.findByEventIdOrderByPriceAsc(id);
        if (tierList.isEmpty()) {
            throw ApiException.badRequest("Cannot publish event without ticket tiers");
        }
        var sectionList = sections.findByEventIdOrderByNameAsc(id);
        if (sectionList.isEmpty()) {
            throw ApiException.badRequest("Cannot publish event without seat sections");
        }
        int totalSeats = sectionList.stream().mapToInt(s -> s.getRowCount() * s.getSeatsPerRow()).sum();
        if (totalSeats <= 0) {
            throw ApiException.badRequest("Cannot publish event with 0 configured seats");
        }
        if (totalSeats > e.getVenue().getCapacity()) {
            throw ApiException.badRequest("Configured seats (" + totalSeats + ") exceed venue capacity (" + e.getVenue().getCapacity() + ")");
        }

        // Khởi tạo toàn bộ ghế sang seat-inventory trước khi chuyển trạng thái
        List<SeatSpec> specs = new ArrayList<>();
        for (SeatSection sec : sectionList) {
            for (int r = 1; r <= sec.getRowCount(); r++) {
                for (int s = 1; s <= sec.getSeatsPerRow(); s++) {
                    String seatId = String.format("%s-%02d-%02d", sec.getName(), r, s);
                    specs.add(new SeatSpec(seatId, sec.getTier().getId()));
                }
            }
        }
        seatInventoryClient.initializeSeats(id, specs);

        e.setStatus(EventStatus.PUBLISHED);
        return toResponse(events.saveAndFlush(e));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse openOnSale(String id) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        if (e.getStatus() != EventStatus.PUBLISHED) {
            throw ApiException.conflict("Only published events can be opened for sale (current status: " + e.getStatus() + ")");
        }
        e.setStatus(EventStatus.ON_SALE);
        return toResponse(events.saveAndFlush(e));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse close(String id) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        if (e.getStatus() != EventStatus.ON_SALE) {
            throw ApiException.conflict("Only on-sale events can be closed (current status: " + e.getStatus() + ")");
        }
        e.setStatus(EventStatus.CLOSED);
        return toResponse(events.saveAndFlush(e));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public EventResponse cancel(String id) {
        Event e = require(id);
        requireOwnerOrAdmin(e);
        if (e.getStatus() == EventStatus.CANCELLED) {
            throw ApiException.conflict("Event is already cancelled");
        }
        if (e.getStatus() == EventStatus.CLOSED) {
            throw ApiException.conflict("Closed events cannot be cancelled");
        }
        e.setStatus(EventStatus.CANCELLED);
        return toResponse(events.saveAndFlush(e));
    }
}
