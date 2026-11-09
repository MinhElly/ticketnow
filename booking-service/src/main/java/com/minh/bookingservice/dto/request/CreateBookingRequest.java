package com.minh.bookingservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;

import java.math.BigDecimal;
import java.util.List;

@Builder
public record CreateBookingRequest(
        @NotBlank String eventId,
        @NotEmpty @Valid List<SeatSelection> seats
) {
    @Builder
    public record SeatSelection(
            @NotBlank String seatId,
            String tierId,
            @NotNull @DecimalMin("0.0") BigDecimal price
    ) {}
}
