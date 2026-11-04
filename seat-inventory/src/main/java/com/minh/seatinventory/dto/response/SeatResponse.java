package com.minh.seatinventory.dto.response;

import com.minh.seatinventory.enums.SeatStatus;
import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SeatResponse {
    private String seatId;
    private String tierId;
    private SeatStatus status;
    private Instant heldUntil;
}
