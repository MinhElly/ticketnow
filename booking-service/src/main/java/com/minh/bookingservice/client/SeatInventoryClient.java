package com.minh.bookingservice.client;

import java.util.List;

public interface SeatInventoryClient {

    HoldResult holdSeats(String eventId, List<String> seatIds, String bookingId, int ttlSeconds);

    void releaseSeats(String eventId, List<String> seatIds, String bookingId);

    void confirmSeats(String eventId, List<String> seatIds, String bookingId);
}
