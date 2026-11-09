package com.minh.paymentservice.controller;

import com.minh.paymentservice.config.CurrentUser;
import com.minh.paymentservice.dto.request.CreatePaymentRequest;
import com.minh.paymentservice.dto.response.PaymentResponse;
import com.minh.paymentservice.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
@Slf4j
public class PaymentController {

    private final PaymentService paymentService;
    private final CurrentUser currentUser;

    @PostMapping
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<PaymentResponse> createPayment(@Valid @RequestBody CreatePaymentRequest request) {
        String userId = currentUser.subject();
        PaymentResponse response = paymentService.createPayment(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<PaymentResponse> getPayment(@PathVariable String id) {
        String userId = currentUser.subject();
        boolean isAdmin = currentUser.isAdmin();
        PaymentResponse response = paymentService.getPayment(id, userId, isAdmin);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/by-booking/{bookingId}")
    @PreAuthorize("hasAnyRole('customer', 'organizer', 'admin')")
    public ResponseEntity<List<PaymentResponse>> getPaymentsByBooking(@PathVariable String bookingId) {
        String userId = currentUser.subject();
        boolean isAdmin = currentUser.isAdmin();
        List<PaymentResponse> responses = paymentService.getPaymentsByBooking(bookingId, userId, isAdmin);
        return ResponseEntity.ok(responses);
    }

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> handleWebhook(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "x-payos-signature", required = false) String payOsSignatureHeader,
            @RequestHeader(value = "signature", required = false) String signatureHeader) {
        String sig = payOsSignatureHeader != null ? payOsSignatureHeader : signatureHeader;
        log.info("Received payment webhook with signature header: {}", sig != null ? "present" : "none");
        Map<String, Object> result = paymentService.handleWebhook(body, sig);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/mock/simulate-success/{orderCode}")
    public ResponseEntity<PaymentResponse> simulateSuccess(@PathVariable Long orderCode) {
        PaymentResponse response = paymentService.simulateSuccess(orderCode);
        return ResponseEntity.ok(response);
    }
}
