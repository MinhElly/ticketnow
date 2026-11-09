package com.minh.ticketservice.repository;

import com.minh.ticketservice.entity.OutboxMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OutboxRepository extends JpaRepository<OutboxMessage, String> {

    @Query("SELECT o FROM OutboxMessage o WHERE o.status = :status ORDER BY o.createdAt ASC")
    List<OutboxMessage> findTopByStatusOrderByCreatedAtAsc(@Param("status") String status, Pageable pageable);
}
