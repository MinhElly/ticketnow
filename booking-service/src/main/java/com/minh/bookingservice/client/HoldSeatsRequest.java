package com.minh.bookingservice.client;

import lombok.Builder;

import java.util.List;

@Builder
public record HoldSeatsRequest(
        String bookingId,
        List<String> seatIds,
        int ttlSeconds
) {}
