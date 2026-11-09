CREATE TABLE bookings (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    status VARCHAR(30) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uk_bookings_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_bookings_user_created ON bookings(user_id, created_at DESC);
CREATE INDEX idx_bookings_status_expires ON bookings(status, expires_at);

CREATE TABLE booking_items (
    booking_id VARCHAR(36) NOT NULL,
    seat_id VARCHAR(30) NOT NULL,
    tier_id VARCHAR(36) NULL,
    price DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (booking_id, seat_id),
    CONSTRAINT fk_booking_items_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE idempotency_records (
    user_id VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_code INT NULL,
    response_body TEXT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, idempotency_key)
);
