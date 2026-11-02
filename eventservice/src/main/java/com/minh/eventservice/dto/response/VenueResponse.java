package com.minh.eventservice.dto.response;

import com.minh.eventservice.entity.Venue;

public record VenueResponse(String id, String name, String address, String city, Integer capacity) {
    public static VenueResponse from(Venue v) {
        return new VenueResponse(v.getId(), v.getName(), v.getAddress(), v.getCity(), v.getCapacity());
    }
}

