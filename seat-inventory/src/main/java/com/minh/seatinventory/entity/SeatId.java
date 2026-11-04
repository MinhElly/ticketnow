package com.minh.seatinventory.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SeatId implements Serializable {

    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(name = "seat_id", length = 30, nullable = false)
    private String seatId;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SeatId seatId1 = (SeatId) o;
        return Objects.equals(eventId, seatId1.eventId) && Objects.equals(seatId, seatId1.seatId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(eventId, seatId);
    }
}
