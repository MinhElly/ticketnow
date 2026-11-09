package com.minh.ticketservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ManualIssueRequest(
        @NotBlank String bookingId,
        @NotBlank String eventId,
        @NotBlank String seatId,
        @NotBlank String seatCode,
        @NotBlank String tierName,
        @NotNull BigDecimal price,
        String currency,
        @NotBlank String userId
) {}
