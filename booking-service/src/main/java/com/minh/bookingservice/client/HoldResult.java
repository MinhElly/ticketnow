package com.minh.bookingservice.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HoldResult {
    private boolean success;
    private List<String> failedSeatIds;
    private Instant expiresAt;
    private String message;
}
