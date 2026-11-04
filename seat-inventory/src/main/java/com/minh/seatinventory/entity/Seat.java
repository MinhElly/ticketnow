package com.minh.seatinventory.entity;

import com.minh.seatinventory.enums.SeatStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "seats")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Seat {

    @EmbeddedId
    private SeatId id;

    @Column(name = "tier_id", length = 36, nullable = false)
    private String tierId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    @Builder.Default
    private SeatStatus status = SeatStatus.AVAILABLE;

    @Column(name = "held_by_booking", length = 36)
    private String heldByBooking;

    @Column(name = "held_until")
    private Instant heldUntil;

    @Version
    @Column(name = "version", nullable = false)
    @Builder.Default
    private Long version = 0L;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (status == null) status = SeatStatus.AVAILABLE;
        if (version == null) version = 0L;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public boolean isAvailableNow() {
        if (status == SeatStatus.AVAILABLE) {
            return true;
        }
        if (status == SeatStatus.HELD && heldUntil != null && heldUntil.isBefore(Instant.now())) {
            // Đã hết hạn giữ ghế -> coi như trống
            return true;
        }
        return false;
    }
}
