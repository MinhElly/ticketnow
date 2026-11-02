package com.minh.eventservice.repository;

import com.minh.eventservice.entity.Event;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, String> {
    boolean existsByVenueId(String venueId);
}

