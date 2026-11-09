package com.minh.bookingservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class BookingItemId implements Serializable {

    @Column(name = "booking_id", length = 36)
    private String bookingId;

    @Column(name = "seat_id", length = 30)
    private String seatId;
}
