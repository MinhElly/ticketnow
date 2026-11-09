package com.minh.ticketservice.repository;

import com.minh.ticketservice.entity.ProcessedEvent;
import com.minh.ticketservice.entity.ProcessedEventId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, ProcessedEventId> {
}
