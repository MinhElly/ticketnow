package com.minh.eventservice.controller;

import com.minh.eventservice.dto.request.EventRequest;
import com.minh.eventservice.dto.response.EventResponse;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.dto.response.SeatMapResponse;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.service.EventService;
import com.minh.eventservice.service.SeatSectionService;
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
    private final SeatSectionService seatSectionService;

    @GetMapping
    public PageResponse<EventResponse> list(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return service.list(page, size);
    }

    @GetMapping("/me")
    public PageResponse<EventResponse> listMine(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) EventStatus status
    ) {
        return service.listMine(page, size, status);
    }

    @GetMapping("/{id}")
    public EventResponse get(@PathVariable String id) {
        return service.get(id);
    }

    @GetMapping("/{id}/seatmap")
    public SeatMapResponse getSeatMap(@PathVariable String id) {
        return seatSectionService.getSeatMap(id);
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
