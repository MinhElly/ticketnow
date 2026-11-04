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
public class ReleaseSeatsRequest {

    @NotEmpty(message = "seatIds cannot be empty")
    private List<String> seatIds;

    @NotBlank(message = "bookingId cannot be blank")
    private String bookingId;
}
