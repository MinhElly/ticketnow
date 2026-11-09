package com.minh.paymentservice.repository;

import com.minh.paymentservice.entity.ProcessedEvent;
import com.minh.paymentservice.entity.ProcessedEventId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, ProcessedEventId> {
}
