package com.minh.ticketservice.entity;

import com.minh.ticketservice.enums.TicketStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "tickets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ticket {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "ticket_code", length = 32, nullable = false, unique = true)
    private String ticketCode;

    @Column(name = "booking_id", length = 36, nullable = false)
    private String bookingId;

    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(name = "seat_id", length = 36, nullable = false)
    private String seatId;

    @Column(name = "seat_code", length = 32, nullable = false)
    private String seatCode;

    @Column(name = "tier_name", length = 64, nullable = false)
    private String tierName;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal price;

    @Column(length = 8, nullable = false)
    @Builder.Default
    private String currency = "VND";

    @Column(name = "user_id", length = 64, nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false)
    @Builder.Default
    private TicketStatus status = TicketStatus.VALID;

    @Column(name = "qr_payload", columnDefinition = "TEXT", nullable = false)
    private String qrPayload;

    @Column(name = "qr_code_url", columnDefinition = "TEXT")
    private String qrCodeUrl;

    @OneToMany(mappedBy = "ticket", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<TicketCheckIn> checkIns = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
