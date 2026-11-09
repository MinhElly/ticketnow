package com.minh.bookingservice.repository;

import com.minh.bookingservice.entity.Booking;
import com.minh.bookingservice.enums.BookingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, String> {

    Optional<Booking> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    Page<Booking> findByUserId(String userId, Pageable pageable);

    Page<Booking> findByUserIdAndStatus(String userId, BookingStatus status, Pageable pageable);

    List<Booking> findByStatusAndExpiresAtBefore(BookingStatus status, Instant cutoff);
}
