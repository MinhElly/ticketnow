package com.minh.eventservice.client;

import java.util.List;

public interface SeatInventoryClient {
    void initializeSeats(String eventId, List<SeatSpec> seats);
}
