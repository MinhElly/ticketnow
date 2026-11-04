CREATE TABLE seats (
    event_id VARCHAR(36) NOT NULL,
    seat_id VARCHAR(30) NOT NULL,
    tier_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    held_by_booking VARCHAR(36) NULL,
    held_until TIMESTAMP NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, seat_id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
