package com.minh.seatinventory.controller;

import com.minh.seatinventory.dto.request.ConfirmSeatsRequest;
import com.minh.seatinventory.dto.request.HoldSeatsRequest;
import com.minh.seatinventory.dto.request.InitSeatsRequest;
import com.minh.seatinventory.dto.request.ReleaseSeatsRequest;
import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.dto.response.SeatResponse;
import com.minh.seatinventory.service.SeatInventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/events/{eventId}/seats")
@RequiredArgsConstructor
public class SeatInventoryController {

    private final SeatInventoryService seatInventoryService;

    @PostMapping("/initialize")
    @PreAuthorize("hasAnyRole('organizer', 'admin')")
    public ResponseEntity<List<SeatResponse>> initializeSeats(
            @PathVariable String eventId,
            @Valid @RequestBody InitSeatsRequest request
    ) {
        List<SeatResponse> seats = seatInventoryService.initializeSeats(eventId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(seats);
    }

    @PostMapping("/hold")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<HoldResult> holdSeats(
            @PathVariable String eventId,
            @Valid @RequestBody HoldSeatsRequest request
    ) {
        HoldResult result = seatInventoryService.holdSeats(eventId, request);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/release")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<Void> releaseSeats(
            @PathVariable String eventId,
            @Valid @RequestBody ReleaseSeatsRequest request
    ) {
        seatInventoryService.releaseSeats(eventId, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/confirm")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<Void> confirmSeats(
            @PathVariable String eventId,
            @Valid @RequestBody ConfirmSeatsRequest request
    ) {
        seatInventoryService.confirmSeats(eventId, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<List<SeatResponse>> getEventSeats(
            @PathVariable String eventId
    ) {
        List<SeatResponse> seats = seatInventoryService.getEventSeats(eventId);
        return ResponseEntity.ok(seats);
    }
}
