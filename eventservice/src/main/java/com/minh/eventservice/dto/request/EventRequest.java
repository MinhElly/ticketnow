package com.minh.eventservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record EventRequest(
        @NotBlank @Size(max = 255) String title,
        @Size(max = 20000) String description,
        @NotBlank @Size(max = 36) String venueId,
        @NotNull Instant startsAt,
        @NotNull Instant endsAt) {
}

