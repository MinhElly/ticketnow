package com.minh.eventservice.service;

import com.minh.eventservice.dto.request.SeatSectionRequest;
import com.minh.eventservice.dto.response.SeatMapResponse;
import com.minh.eventservice.dto.response.SeatSectionResponse;
import com.minh.eventservice.entity.Event;
import com.minh.eventservice.entity.SeatSection;
import com.minh.eventservice.entity.TicketTier;
import com.minh.eventservice.exception.ApiException;
import com.minh.eventservice.repository.SeatSectionRepository;
import com.minh.eventservice.repository.TicketTierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SeatSectionService {
    private final SeatSectionRepository sections;
    private final TicketTierRepository tiers;
    private final EventService events;

    public List<SeatSectionResponse> list(String eventId) {
        events.requireReadable(events.require(eventId));
        return sections.findByEventIdOrderByNameAsc(eventId).stream().map(SeatSectionResponse::from).toList();
    }

    public SeatSectionResponse get(String eventId, String id) {
        events.requireReadable(events.require(eventId));
        return SeatSectionResponse.from(require(eventId, id));
    }

    public SeatSection require(String eventId, String id) {
        return sections.findByIdAndEventId(id, eventId).orElseThrow(() -> ApiException.notFound("Seat section"));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public SeatSectionResponse create(String eventId, SeatSectionRequest r) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);

        if (sections.existsByEventIdAndNameIgnoreCase(eventId, r.name().trim())) {
            throw ApiException.conflict("Section name already exists");
        }

        TicketTier tier = tiers.findById(r.tierId())
                .filter(t -> t.getEvent().getId().equals(eventId))
                .orElseThrow(() -> ApiException.badRequest("Ticket tier not found or does not belong to this event"));

        int existingSeats = sections.findByEventIdOrderByNameAsc(eventId).stream()
                .mapToInt(s -> s.getRowCount() * s.getSeatsPerRow())
                .sum();
        int addedSeats = r.rowCount() * r.seatsPerRow();
        int capacity = e.getVenue().getCapacity();

        if (existingSeats + addedSeats > capacity) {
            throw ApiException.badRequest("Total seats (" + (existingSeats + addedSeats) + ") would exceed venue capacity (" + capacity + ")");
        }

        SeatSection s = new SeatSection();
        s.setEvent(e);
        s.setTier(tier);
        s.setName(r.name().trim());
        s.setRowCount(r.rowCount());
        s.setSeatsPerRow(r.seatsPerRow());
        return SeatSectionResponse.from(sections.saveAndFlush(s));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public SeatSectionResponse update(String eventId, String id, SeatSectionRequest r) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);

        SeatSection s = require(eventId, id);
        if (!s.getName().equalsIgnoreCase(r.name().trim()) && sections.existsByEventIdAndNameIgnoreCase(eventId, r.name().trim())) {
            throw ApiException.conflict("Section name already exists");
        }

        TicketTier tier = tiers.findById(r.tierId())
                .filter(t -> t.getEvent().getId().equals(eventId))
                .orElseThrow(() -> ApiException.badRequest("Ticket tier not found or does not belong to this event"));

        int otherSeats = sections.findByEventIdOrderByNameAsc(eventId).stream()
                .filter(sec -> !sec.getId().equals(id))
                .mapToInt(sec -> sec.getRowCount() * sec.getSeatsPerRow())
                .sum();
        int newSeats = r.rowCount() * r.seatsPerRow();
        int capacity = e.getVenue().getCapacity();

        if (otherSeats + newSeats > capacity) {
            throw ApiException.badRequest("Total seats (" + (otherSeats + newSeats) + ") would exceed venue capacity (" + capacity + ")");
        }

        s.setTier(tier);
        s.setName(r.name().trim());
        s.setRowCount(r.rowCount());
        s.setSeatsPerRow(r.seatsPerRow());
        return SeatSectionResponse.from(sections.saveAndFlush(s));
    }

    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    @Transactional
    public void delete(String eventId, String id) {
        Event e = events.require(eventId);
        events.requireOwnerOrAdmin(e);
        events.requireDraft(e);
        sections.delete(require(eventId, id));
    }

    public SeatMapResponse getSeatMap(String eventId) {
        Event e = events.require(eventId);
        events.requireReadable(e);

        List<SeatSection> sectionList = sections.findByEventIdOrderByNameAsc(eventId);
        int totalConfiguredSeats = sectionList.stream()
                .mapToInt(s -> s.getRowCount() * s.getSeatsPerRow())
                .sum();

        List<SeatMapResponse.SectionDetail> sectionDetails = new ArrayList<>(sectionList.size());
        for (SeatSection s : sectionList) {
            int rowCount = s.getRowCount();
            int seatsPerRow = s.getSeatsPerRow();
            List<SeatMapResponse.SeatDetail> seatList = new ArrayList<>(rowCount * seatsPerRow);

            for (int r = 1; r <= rowCount; r++) {
                for (int c = 1; c <= seatsPerRow; c++) {
                    String seatId = String.format("%s-%02d-%02d", s.getName(), r, c);
                    seatList.add(new SeatMapResponse.SeatDetail(seatId, r, c));
                }
            }

            SeatMapResponse.TierDetail tierDetail = new SeatMapResponse.TierDetail(
                    s.getTier().getId(),
                    s.getTier().getName(),
                    s.getTier().getPrice(),
                    s.getTier().getCurrency()
            );

            sectionDetails.add(new SeatMapResponse.SectionDetail(
                    s.getId(),
                    s.getName(),
                    tierDetail,
                    rowCount,
                    seatsPerRow,
                    rowCount * seatsPerRow,
                    seatList
            ));
        }

        return new SeatMapResponse(
                e.getId(),
                e.getVenue().getId(),
                e.getVenue().getCapacity(),
                totalConfiguredSeats,
                sectionDetails
        );
    }
}
