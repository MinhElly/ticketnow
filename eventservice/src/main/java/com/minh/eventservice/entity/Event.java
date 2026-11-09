package com.minh.eventservice.entity;

import com.minh.eventservice.enums.EventStatus;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "events", indexes = {@Index(name = "idx_events_status_start", columnList = "status,starts_at")})
@Getter
@Setter
@NoArgsConstructor
public class Event {
    @Id
    @Column(length = 36)
    private String id;
    @Column(nullable = false, length = 255)
    private String title;
    @Column(columnDefinition = "TEXT")
    private String description;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "venue_id", nullable = false)
    private Venue venue;
    @Column(name = "organizer_id", nullable = false, length = 255)
    private String organizerId;
    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;
    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private EventStatus status = EventStatus.DRAFT;
    @Column(length = 255, unique = true)
    private String slug;
    @Column(length = 100)
    private String category;
    @Column(name = "image_url", length = 1000)
    private String imageUrl;
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
