package com.minh.eventservice.service;

import com.minh.eventservice.dto.request.VenueRequest;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.dto.response.VenueResponse;
import com.minh.eventservice.entity.Venue;
import com.minh.eventservice.exception.ApiException;
import com.minh.eventservice.repository.EventRepository;
import com.minh.eventservice.repository.VenueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class VenueService {
    private final VenueRepository venues;
    private final EventRepository events;

    public Venue require(String id) {
        return venues.findById(id).orElseThrow(() -> ApiException.notFound("Venue"));
    }

    public VenueResponse get(String id) {
        return VenueResponse.from(require(id));
    }

    public PageResponse<VenueResponse> list(int page, int size) {
        return PageResponse.from(venues.findAll(PageRequest.of(page, size, Sort.by("id"))).map(VenueResponse::from));
    }

    @PreAuthorize("hasRole('admin')")
    @Transactional
    public VenueResponse create(VenueRequest r) {
        return VenueResponse.from(venues.save(new Venue(r.name().trim(), r.address().trim(), r.city().trim(), r.capacity())));
    }

    @PreAuthorize("hasRole('admin')")
    @Transactional
    public VenueResponse update(String id, VenueRequest r) {
        Venue v = require(id);
        v.setName(r.name().trim());
        v.setAddress(r.address().trim());
        v.setCity(r.city().trim());
        v.setCapacity(r.capacity());
        return VenueResponse.from(venues.save(v));
    }

    @PreAuthorize("hasRole('admin')")
    @Transactional
    public void delete(String id) {
        Venue v = require(id);
        if (events.existsByVenueId(id)) throw ApiException.conflict("Venue is referenced by events");
        venues.delete(v);
    }
}

