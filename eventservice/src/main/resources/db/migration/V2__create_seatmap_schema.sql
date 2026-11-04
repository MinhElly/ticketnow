CREATE TABLE seat_sections (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    tier_id VARCHAR(36) NOT NULL,
    name VARCHAR(50) NOT NULL,
    row_count INTEGER NOT NULL,
    seats_per_row INTEGER NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_sections_event FOREIGN KEY (event_id) REFERENCES events(id),
    CONSTRAINT fk_sections_tier FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id),
    CONSTRAINT uk_section_event_name UNIQUE (event_id, name),
    CONSTRAINT ck_sections_rows CHECK (row_count > 0),
    CONSTRAINT ck_sections_seats CHECK (seats_per_row > 0)
);

CREATE INDEX idx_sections_event ON seat_sections(event_id);
CREATE INDEX idx_sections_tier ON seat_sections(tier_id);
