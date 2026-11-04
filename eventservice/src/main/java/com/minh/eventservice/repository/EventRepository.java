package com.minh.eventservice.repository;

import com.minh.eventservice.entity.Event;
import com.minh.eventservice.enums.EventStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;

public interface EventRepository extends JpaRepository<Event, String> {
    boolean existsByVenueId(String venueId);

    Page<Event> findByStatusIn(Collection<EventStatus> statuses, Pageable pageable);

    Page<Event> findByOrganizerId(String organizerId, Pageable pageable);

    Page<Event> findByOrganizerIdAndStatus(String organizerId, EventStatus status, Pageable pageable);
}
