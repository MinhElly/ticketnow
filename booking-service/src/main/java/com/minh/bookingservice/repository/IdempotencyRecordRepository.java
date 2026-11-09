package com.minh.bookingservice.repository;

import com.minh.bookingservice.entity.IdempotencyRecord;
import com.minh.bookingservice.entity.IdempotencyRecordId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, IdempotencyRecordId> {
}
