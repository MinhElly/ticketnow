CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(36) NOT NULL,
    ticket_code VARCHAR(32) NOT NULL,
    booking_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    seat_id VARCHAR(36) NOT NULL,
    seat_code VARCHAR(32) NOT NULL,
    tier_name VARCHAR(64) NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'VND',
    user_id VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'VALID',
    qr_payload TEXT NOT NULL,
    qr_code_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_tickets_ticket_code UNIQUE (ticket_code)
);

CREATE INDEX idx_tickets_booking_id ON tickets (booking_id);
CREATE INDEX idx_tickets_user_id ON tickets (user_id);
CREATE INDEX idx_tickets_event_id ON tickets (event_id);
CREATE INDEX idx_tickets_ticket_code ON tickets (ticket_code);

CREATE TABLE IF NOT EXISTS ticket_checkins (
    id VARCHAR(36) NOT NULL,
    ticket_id VARCHAR(36) NOT NULL,
    checked_in_by VARCHAR(64) NOT NULL,
    device_info VARCHAR(128),
    checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_checkins_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX idx_checkins_ticket_id ON ticket_checkins (ticket_id);

CREATE TABLE IF NOT EXISTS outbox (
    id VARCHAR(36) NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload LONGTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    retry_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE INDEX idx_ticket_outbox_status_created ON outbox (status, created_at);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(64) NOT NULL,
    consumer_name VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, consumer_name)
);
