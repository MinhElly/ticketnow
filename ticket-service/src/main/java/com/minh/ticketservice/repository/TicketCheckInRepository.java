package com.minh.ticketservice.repository;

import com.minh.ticketservice.entity.TicketCheckIn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TicketCheckInRepository extends JpaRepository<TicketCheckIn, String> {
    List<TicketCheckIn> findByTicketIdOrderByCheckedInAtDesc(String ticketId);
}
