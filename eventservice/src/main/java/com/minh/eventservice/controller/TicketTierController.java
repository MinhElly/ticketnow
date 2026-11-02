package com.minh.eventservice.controller;

import com.minh.eventservice.dto.request.TicketTierRequest;
import com.minh.eventservice.dto.response.TicketTierResponse;
import com.minh.eventservice.service.TicketTierService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/events/{eventId}/ticket-tiers")
@RequiredArgsConstructor
public class TicketTierController {
    private final TicketTierService service;

    @GetMapping
    public List<TicketTierResponse> list(@PathVariable String eventId) {
        return service.list(eventId);
    }

    @PostMapping
    public ResponseEntity<TicketTierResponse> create(@PathVariable String eventId, @Valid @RequestBody TicketTierRequest request) {
        TicketTierResponse result = service.create(eventId, request);
        return ResponseEntity.created(URI.create("/api/v1/events/" + eventId + "/ticket-tiers/" + result.id())).body(result);
    }

    @GetMapping("/{id}")
    public TicketTierResponse get(@PathVariable String eventId, @PathVariable String id) {
        return service.get(eventId, id);
    }

    @PutMapping("/{id}")
    public TicketTierResponse update(@PathVariable String eventId, @PathVariable String id, @Valid @RequestBody TicketTierRequest request) {
        return service.update(eventId, id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String eventId, @PathVariable String id) {
        service.delete(eventId, id);
        return ResponseEntity.noContent().build();
    }
}

