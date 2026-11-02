package com.minh.eventservice.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "venues")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Venue {

    @Id
    @Column(nullable = false, updatable = false, length = 36)
    private String id;

    @Setter
    @Column(nullable = false, length = 200)
    private String name;

    @Setter
    @Column(nullable = false, length = 500)
    private String address;

    @Setter
    @Column(nullable = false, length = 100)
    private String city;

    @Setter
    @Column(nullable = false)
    private Integer capacity;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Venue(
            String name,
            String address,
            String city,
            Integer capacity
    ) {
        this.name = name;
        this.address = address;
        this.city = city;
        this.capacity = capacity;
    }

    @PrePersist
    private void onCreate() {
        if (id == null) {
            id = UUID.randomUUID().toString();
        }

        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    private void onUpdate() {
        updatedAt = Instant.now();
    }
}