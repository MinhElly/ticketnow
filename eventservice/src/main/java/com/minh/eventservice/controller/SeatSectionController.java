package com.minh.eventservice.controller;

import com.minh.eventservice.dto.request.SeatSectionRequest;
import com.minh.eventservice.dto.response.SeatSectionResponse;
import com.minh.eventservice.service.SeatSectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/events/{eventId}/sections")
@RequiredArgsConstructor
public class SeatSectionController {
    private final SeatSectionService service;

    @GetMapping
    public List<SeatSectionResponse> list(@PathVariable String eventId) {
        return service.list(eventId);
    }

    @PostMapping
    public ResponseEntity<SeatSectionResponse> create(@PathVariable String eventId, @Valid @RequestBody SeatSectionRequest request) {
        SeatSectionResponse result = service.create(eventId, request);
        return ResponseEntity.created(URI.create("/api/v1/events/" + eventId + "/sections/" + result.id())).body(result);
    }

    @GetMapping("/{id}")
    public SeatSectionResponse get(@PathVariable String eventId, @PathVariable String id) {
        return service.get(eventId, id);
    }

    @PutMapping("/{id}")
    public SeatSectionResponse update(@PathVariable String eventId, @PathVariable String id, @Valid @RequestBody SeatSectionRequest request) {
        return service.update(eventId, id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String eventId, @PathVariable String id) {
        service.delete(eventId, id);
        return ResponseEntity.noContent().build();
    }
}
