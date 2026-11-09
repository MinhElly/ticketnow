package com.minh.paymentservice.repository;

import com.minh.paymentservice.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, String> {
    Optional<Payment> findByOrderCode(Long orderCode);
    List<Payment> findByBookingId(String bookingId);
    List<Payment> findByUserId(String userId);
}
