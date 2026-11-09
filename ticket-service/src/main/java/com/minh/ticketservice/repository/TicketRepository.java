package com.minh.ticketservice.repository;

import com.minh.ticketservice.entity.Ticket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TicketRepository extends JpaRepository<Ticket, String> {

    List<Ticket> findByUserIdOrderByCreatedAtDesc(String userId);

    List<Ticket> findByBookingId(String bookingId);

    Optional<Ticket> findByTicketCode(String ticketCode);

    long countByBookingId(String bookingId);

    @Query("SELECT t FROM Ticket t LEFT JOIN FETCH t.checkIns WHERE t.id = :id")
    Optional<Ticket> findByIdWithCheckIns(@Param("id") String id);

    @Query("SELECT t FROM Ticket t LEFT JOIN FETCH t.checkIns WHERE t.ticketCode = :ticketCode")
    Optional<Ticket> findByTicketCodeWithCheckIns(@Param("ticketCode") String ticketCode);
}
