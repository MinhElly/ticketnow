package com.minh.paymentservice.repository;

import com.minh.paymentservice.entity.OutboxMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OutboxRepository extends JpaRepository<OutboxMessage, String> {

    @Query("SELECT o FROM OutboxMessage o WHERE o.publishedAt IS NULL ORDER BY o.createdAt ASC")
    List<OutboxMessage> findPendingMessages(Pageable pageable);
}
