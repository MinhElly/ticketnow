package com.minh.paymentservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreatePaymentRequest {

    @NotBlank(message = "bookingId is required")
    private String bookingId;

    @NotNull(message = "amount is required")
    @Min(value = 1000, message = "amount must be at least 1,000 VND")
    private Long amount;

    private String description;

    /**
     * Optional provider override (e.g. "PAYOS" or "MOCK").
     * Defaults to the server configured provider.
     */
    private String provider;
}
