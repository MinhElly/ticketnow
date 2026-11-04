package com.minh.seatinventory.dto.response;

import lombok.*;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HoldResult {
    private boolean success;
    private List<String> failedSeatIds;
    private Instant expiresAt;
    private String message;

    public static HoldResult success(Instant expiresAt) {
        return HoldResult.builder()
                .success(true)
                .failedSeatIds(Collections.emptyList())
                .expiresAt(expiresAt)
                .message("Seats held successfully")
                .build();
    }

    public static HoldResult fail(List<String> failedSeatIds, String message) {
        return HoldResult.builder()
                .success(false)
                .failedSeatIds(failedSeatIds != null ? failedSeatIds : Collections.emptyList())
                .expiresAt(null)
                .message(message)
                .build();
    }
}
