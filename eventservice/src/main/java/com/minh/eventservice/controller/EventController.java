package com.minh.eventservice.controller;

import com.minh.eventservice.dto.request.EventRequest;
import com.minh.eventservice.dto.response.EventResponse;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.service.EventService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/events")
@RequiredArgsConstructor
public class EventController {
    private final EventService service;

    @GetMapping
    public PageResponse<EventResponse> list(@RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    public EventResponse get(@PathVariable String id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<EventResponse> create(@Valid @RequestBody EventRequest request) {
        EventResponse result = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/events/" + result.id())).body(result);
    }

    @PutMapping("/{id}")
    public EventResponse update(@PathVariable String id, @Valid @RequestBody EventRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}

