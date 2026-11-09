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
public class IdempotencyRecordId implements Serializable {

    @Column(name = "user_id", length = 255)
    private String userId;

    @Column(name = "idempotency_key", length = 100)
    private String idempotencyKey;
}
