package com.minh.seatinventory.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InitSeatsRequest {

    @NotEmpty(message = "Seats list cannot be empty")
    private List<SeatSpec> seats;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SeatSpec {
        @NotBlank(message = "seatId cannot be blank")
        private String seatId;

        @NotBlank(message = "tierId cannot be blank")
        private String tierId;
    }
}
