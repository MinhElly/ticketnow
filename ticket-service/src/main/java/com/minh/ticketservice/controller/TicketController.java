package com.minh.ticketservice.controller;

import com.minh.ticketservice.dto.request.CheckInRequest;
import com.minh.ticketservice.dto.request.ManualIssueRequest;
import com.minh.ticketservice.dto.response.CheckInResponse;
import com.minh.ticketservice.dto.response.TicketResponse;
import com.minh.ticketservice.service.TicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/tickets")
@RequiredArgsConstructor
@Slf4j
public class TicketController {

    private final TicketService ticketService;

    @GetMapping("/my-tickets")
    public ResponseEntity<List<TicketResponse>> getMyTickets() {
        return ResponseEntity.ok(ticketService.getMyTickets());
    }

    @GetMapping("/{id}")
    public ResponseEntity<TicketResponse> getTicketById(@PathVariable String id) {
        return ResponseEntity.ok(ticketService.getTicketById(id));
    }

    @GetMapping("/by-booking/{bookingId}")
    public ResponseEntity<List<TicketResponse>> getTicketsByBooking(@PathVariable String bookingId) {
        return ResponseEntity.ok(ticketService.getTicketsByBooking(bookingId));
    }

    @PostMapping("/check-in")
    @PreAuthorize("hasAnyRole('organizer', 'admin', 'staff')")
    public ResponseEntity<CheckInResponse> checkIn(@Valid @RequestBody CheckInRequest request) {
        return ResponseEntity.ok(ticketService.checkIn(request));
    }

    @PostMapping("/manual-issue")
    @PreAuthorize("hasAnyRole('organizer', 'admin', 'staff')")
    public ResponseEntity<TicketResponse> manualIssue(@Valid @RequestBody ManualIssueRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ticketService.manualIssue(request));
    }
}
