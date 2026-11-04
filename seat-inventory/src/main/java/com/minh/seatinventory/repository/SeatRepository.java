package com.minh.seatinventory.repository;

import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.entity.SeatId;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SeatRepository extends JpaRepository<Seat, SeatId> {

    Optional<Seat> findById_EventIdAndId_SeatId(String eventId, String seatId);

    List<Seat> findById_EventId(String eventId);

    List<Seat> findById_EventIdAndId_SeatIdIn(String eventId, Collection<String> seatIds);

    /**
     * Dùng cho Pessimistic Lock: khóa ghi (PESSIMISTIC_WRITE) và sắp xếp cố định
     * theo seat_id để chống Deadlock giữa các giao dịch tranh chấp ghế đồng thời.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Seat s WHERE s.id.eventId = :eventId AND s.id.seatId IN :seatIds ORDER BY s.id.seatId ASC")
    List<Seat> findSeatsForUpdateOrdered(@Param("eventId") String eventId, @Param("seatIds") Collection<String> seatIds);
}
