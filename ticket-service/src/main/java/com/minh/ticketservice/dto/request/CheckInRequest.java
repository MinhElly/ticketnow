package com.minh.ticketservice.dto.request;

public record CheckInRequest(
        String ticketCode,
        String qrPayload,
        String deviceInfo
) {}
