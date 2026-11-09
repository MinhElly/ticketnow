package com.minh.bookingservice.controller;

import com.minh.bookingservice.config.CurrentUser;
import com.minh.bookingservice.dto.request.CreateBookingRequest;
import com.minh.bookingservice.dto.response.BookingResponse;
import com.minh.bookingservice.dto.response.PageResponse;
import com.minh.bookingservice.service.BookingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/bookings")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;
    private final CurrentUser currentUser;

    @PostMapping
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<BookingResponse> createBooking(
            @RequestHeader(value = "Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody CreateBookingRequest request
    ) {
        String userId = currentUser.subject();
        BookingResponse response = bookingService.createBooking(userId, idempotencyKey, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable String id) {
        BookingResponse response = bookingService.getBooking(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<PageResponse<BookingResponse>> getMyBookings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        String userId = currentUser.subject();
        PageResponse<BookingResponse> response = bookingService.listMyBookings(userId, page, size);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<BookingResponse> cancelBooking(@PathVariable String id) {
        BookingResponse response = bookingService.cancelBooking(id);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/confirm")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<BookingResponse> confirmBooking(@PathVariable String id) {
        BookingResponse response = bookingService.confirmBooking(id);
        return ResponseEntity.ok(response);
    }
}
