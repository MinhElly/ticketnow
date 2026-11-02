package com.minh.eventservice.dto.request;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record TicketTierRequest(@NotBlank @Size(max = 100) String name,
                                @NotNull @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal price,
                                @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency) {
}

