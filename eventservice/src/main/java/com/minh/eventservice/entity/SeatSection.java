package com.minh.eventservice.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "seat_sections",
    uniqueConstraints = @UniqueConstraint(name = "uk_section_event_name", columnNames = {"event_id", "name"}),
    indexes = {
        @Index(name = "idx_sections_event", columnList = "event_id"),
        @Index(name = "idx_sections_tier", columnList = "tier_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class SeatSection {
    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tier_id", nullable = false)
    private TicketTier tier;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "row_count", nullable = false)
    private int rowCount;

    @Column(name = "seats_per_row", nullable = false)
    private int seatsPerRow;

    @Version
    private long version;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void create() {
        id = UUID.randomUUID().toString();
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void update() {
        updatedAt = Instant.now();
    }
}
