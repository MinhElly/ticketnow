-- All timestamps represent UTC. IDs are application-generated UUID strings.
CREATE TABLE venues (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    capacity INTEGER NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT ck_venues_capacity CHECK (capacity > 0)
);

CREATE TABLE events (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue_id VARCHAR(36) NOT NULL,
    organizer_id VARCHAR(255) NOT NULL,
    starts_at TIMESTAMP(6) NOT NULL,
    ends_at TIMESTAMP(6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
    CONSTRAINT ck_events_times CHECK (ends_at > starts_at),
    CONSTRAINT ck_events_status CHECK (status IN ('DRAFT','PUBLISHED','ON_SALE','CLOSED','CANCELLED'))
);
CREATE INDEX idx_events_status_start ON events(status, starts_at);
CREATE INDEX idx_events_organizer_created ON events(organizer_id, created_at);
CREATE INDEX idx_events_venue ON events(venue_id);

CREATE TABLE ticket_tiers (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_tiers_event FOREIGN KEY (event_id) REFERENCES events(id),
    CONSTRAINT uk_tier_event_name UNIQUE (event_id, name),
    CONSTRAINT ck_tiers_price CHECK (price >= 0)
);
