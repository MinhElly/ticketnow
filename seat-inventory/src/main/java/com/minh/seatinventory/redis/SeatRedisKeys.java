package com.minh.seatinventory.redis;

/**
 * Centralized Redis key format for seat state. The hash tag {eventId} keeps all
 * seats of one event in the same Redis Cluster slot.
 */
public final class SeatRedisKeys {

    private SeatRedisKeys() {
    }

    public static String seatKey(String eventId, String seatId) {
        return "seat:{" + eventId + "}:" + seatId;
    }

    public static String heldValue(String bookingId) {
        return "HELD:" + bookingId;
    }
}
