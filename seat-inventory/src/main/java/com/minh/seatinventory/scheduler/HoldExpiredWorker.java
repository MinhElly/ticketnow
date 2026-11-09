package com.minh.seatinventory.scheduler;

import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.redis.SeatRedisKeys;
import com.minh.seatinventory.repository.SeatRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Job HoldExpired: every 30 seconds releases seats whose HELD TTL has elapsed.
 * The DB is the durable record; the Redis key is deleted only when it still
 * belongs to the same booking, so a freshly re-held seat is never touched.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "seat.hold-expiry", name = "enabled", havingValue = "true", matchIfMissing = true)
public class HoldExpiredWorker {

    private static final DefaultRedisScript<Long> DELETE_IF_MATCH = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) == ARGV[1] then
                return redis.call('DEL', KEYS[1])
            end
            return 0
            """, Long.class);

    private final SeatRepository seatRepository;
    private final StringRedisTemplate redisTemplate;

    @Scheduled(
            fixedDelayString = "${seat.hold-expiry.sweep-interval-ms:30000}",
            initialDelayString = "${seat.hold-expiry.initial-delay-ms:15000}")
    @Transactional
    public void releaseExpiredHolds() {
        Instant now = Instant.now();
        List<Seat> expired = seatRepository.findExpiredHoldsForUpdate(SeatStatus.HELD, now);

        if (expired.isEmpty()) {
            return;
        }

        for (Seat seat : expired) {
            cleanupRedis(seat);
            seat.setStatus(SeatStatus.AVAILABLE);
            seat.setHeldByBooking(null);
            seat.setHeldUntil(null);
        }
        seatRepository.saveAll(expired);

        log.info("HoldExpired sweep released {} seats (cutoff={})", expired.size(), now);
    }

    private void cleanupRedis(Seat seat) {
        String bookingId = seat.getHeldByBooking();
        if (bookingId == null) {
            return;
        }
        String key = SeatRedisKeys.seatKey(seat.getId().getEventId(), seat.getId().getSeatId());
        try {
            redisTemplate.execute(DELETE_IF_MATCH, List.of(key), SeatRedisKeys.heldValue(bookingId));
        } catch (Exception ex) {
            // Redis is a cache/fast path; the DB update must still commit.
            log.warn("Could not delete Redis key {} during HoldExpired sweep: {}", key, ex.getMessage());
        }
    }
}
