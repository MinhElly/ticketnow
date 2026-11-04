package com.minh.eventservice.repository;

import com.minh.eventservice.entity.SeatSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SeatSectionRepository extends JpaRepository<SeatSection, String> {
    List<SeatSection> findByEventIdOrderByNameAsc(String eventId);

    Optional<SeatSection> findByIdAndEventId(String id, String eventId);

    boolean existsByEventIdAndNameIgnoreCase(String eventId, String name);

    boolean existsByTierId(String tierId);

    void deleteAllByEventId(String eventId);
}
