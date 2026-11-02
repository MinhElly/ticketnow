package com.minh.eventservice.repository;

import com.minh.eventservice.entity.Venue;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueRepository extends JpaRepository<Venue, String> {
}
