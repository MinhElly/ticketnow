package com.minh.eventservice.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SeatSectionRequest(
        @NotBlank
        @Size(max = 50)
        @Pattern(regexp = "^[A-Za-z0-9_-]+$", message = "Section name must contain only alphanumeric characters, underscores, or hyphens")
        String name,

        @NotBlank
        String tierId,

        @Min(1)
        @Max(100)
        int rowCount,

        @Min(1)
        @Max(100)
        int seatsPerRow
) {
}
