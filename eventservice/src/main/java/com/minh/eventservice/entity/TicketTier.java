package com.minh.eventservice.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "ticket_tiers", uniqueConstraints = @UniqueConstraint(name = "uk_tier_event_name", columnNames = {"event_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
public class TicketTier {
    @Id
    @Column(length = 36)
    private String id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;
    @Column(nullable = false, length = 100)
    private String name;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;
    @Column(nullable = false, length = 3)
    private String currency;
    @Version
    private long version;

    @PrePersist
    void create() {
        id = UUID.randomUUID().toString();
    }
}

