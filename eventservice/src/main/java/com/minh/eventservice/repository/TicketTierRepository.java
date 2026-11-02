package com.minh.eventservice.repository;

import com.minh.eventservice.entity.TicketTier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TicketTierRepository extends JpaRepository<TicketTier, String> {
    List<TicketTier> findByEventIdOrderByPriceAsc(String eventId);

    boolean existsByEventIdAndNameIgnoreCase(String eventId, String name);
}

