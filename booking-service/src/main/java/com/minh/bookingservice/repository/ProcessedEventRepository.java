package com.minh.bookingservice.repository;

import com.minh.bookingservice.entity.ProcessedEvent;
import com.minh.bookingservice.entity.ProcessedEventId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, ProcessedEventId> {
}
