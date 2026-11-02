package com.minh.eventservice.controller;

import com.minh.eventservice.dto.request.VenueRequest;
import com.minh.eventservice.dto.response.PageResponse;
import com.minh.eventservice.dto.response.VenueResponse;
import com.minh.eventservice.service.VenueService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/venues")
@RequiredArgsConstructor
public class VenueController {
    private final VenueService service;

    @GetMapping
    public PageResponse<VenueResponse> list(@RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    public VenueResponse get(@PathVariable String id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<VenueResponse> create(@Valid @RequestBody VenueRequest request) {
        VenueResponse result = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/venues/" + result.id())).body(result);
    }

    @PutMapping("/{id}")
    public VenueResponse update(@PathVariable String id, @Valid @RequestBody VenueRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}

