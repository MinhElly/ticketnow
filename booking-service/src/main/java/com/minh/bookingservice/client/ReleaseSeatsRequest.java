package com.minh.bookingservice.client;

import lombok.Builder;

import java.util.List;

@Builder
public record ReleaseSeatsRequest(
        String bookingId,
        List<String> seatIds
) {}
