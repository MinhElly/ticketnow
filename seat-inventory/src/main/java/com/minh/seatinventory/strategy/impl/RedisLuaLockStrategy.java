package com.minh.seatinventory.strategy.impl;

import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.repository.SeatRepository;
import com.minh.seatinventory.strategy.SeatLockStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service("redisLuaLockStrategy")
@RequiredArgsConstructor
@Slf4j
public class RedisLuaLockStrategy implements SeatLockStrategy {

    private final StringRedisTemplate redisTemplate;
    private final SeatRepository seatRepository;

    private static final String HOLD_LUA = """
            local mine = 'HELD:' .. ARGV[1]
            for i = 1, #KEYS do
                local val = redis.call('GET', KEYS[i])
                if val and val ~= mine then
                    return {0, KEYS[i]}
                end
            end
            for i = 1, #KEYS do
                redis.call('SET', KEYS[i], mine, 'EX', ARGV[2])
            end
            return {1}
            """;

    private static final String RELEASE_LUA = """
            local mine = 'HELD:' .. ARGV[1]
            for i = 1, #KEYS do
                local val = redis.call('GET', KEYS[i])
                if val == mine then
                    redis.call('DEL', KEYS[i])
                end
            end
            return 1
            """;

    private static final String CONFIRM_LUA = """
            local mine = 'HELD:' .. ARGV[1]
            for i = 1, #KEYS do
                local val = redis.call('GET', KEYS[i])
                if val ~= mine then
                    return {0, KEYS[i]}
                end
            end
            for i = 1, #KEYS do
                redis.call('SET', KEYS[i], 'SOLD')
            end
            return {1}
            """;

    private String seatKey(String eventId, String seatId) {
        return "seat:{" + eventId + "}:" + seatId;
    }

    @Override
    @Transactional
    public HoldResult hold(String eventId, List<String> seatIds, String bookingId, Duration ttl) {
        if (seatIds == null || seatIds.isEmpty()) {
            return HoldResult.fail(Collections.emptyList(), "Seat list is empty");
        }

        List<String> distinctSeatIds = seatIds.stream().distinct().sorted().toList();

        // 1. Kiểm tra tồn tại trong Database
        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, distinctSeatIds);
        Map<String, Seat> seatMap = seats.stream().collect(Collectors.toMap(s -> s.getId().getSeatId(), s -> s));

        List<String> nonExistent = new ArrayList<>();
        for (String seatId : distinctSeatIds) {
            if (!seatMap.containsKey(seatId)) {
                nonExistent.add(seatId);
            }
        }
        if (!nonExistent.isEmpty()) {
            return HoldResult.fail(nonExistent, "Seats do not exist in inventory");
        }

        // 2. Chạy Lua script trên Redis
        List<String> keys = distinctSeatIds.stream()
                .map(seatId -> seatKey(eventId, seatId))
                .toList();

        DefaultRedisScript<List> script = new DefaultRedisScript<>(HOLD_LUA, List.class);
        long ttlSeconds = ttl.getSeconds() > 0 ? ttl.getSeconds() : 600;

        List<?> result = redisTemplate.execute(script, keys, bookingId, String.valueOf(ttlSeconds));

        if (result == null || result.isEmpty() || !Long.valueOf(1).equals(result.get(0))) {
            String conflictedKey = result != null && result.size() > 1 ? String.valueOf(result.get(1)) : "";
            String conflictedSeatId = conflictedKey.contains(":") ? conflictedKey.substring(conflictedKey.lastIndexOf(":") + 1) : conflictedKey;
            log.warn("Redis hold failed due to conflict on seat key {} for booking {}", conflictedKey, bookingId);
            return HoldResult.fail(List.of(conflictedSeatId), "One or more seats are currently held or sold");
        }

        // 3. Cập nhật bền vững xuống DB (lớp phòng thủ thứ hai)
        Instant expiresAt = Instant.now().plus(ttl);
        for (Seat seat : seats) {
            seat.setStatus(SeatStatus.HELD);
            seat.setHeldByBooking(bookingId);
            seat.setHeldUntil(expiresAt);
        }
        seatRepository.saveAll(seats);

        log.info("Redis hold succeeded for booking {} on {} seats until {}", bookingId, seats.size(), expiresAt);
        return HoldResult.success(expiresAt);
    }

    @Override
    @Transactional
    public void release(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<String> distinctSeatIds = seatIds.stream().distinct().toList();
        List<String> keys = distinctSeatIds.stream()
                .map(seatId -> seatKey(eventId, seatId))
                .toList();

        DefaultRedisScript<Long> script = new DefaultRedisScript<>(RELEASE_LUA, Long.class);
        redisTemplate.execute(script, keys, bookingId);

        // Đồng bộ DB
        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, distinctSeatIds);
        List<Seat> toRelease = new ArrayList<>();
        for (Seat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD && bookingId.equals(seat.getHeldByBooking())) {
                seat.setStatus(SeatStatus.AVAILABLE);
                seat.setHeldByBooking(null);
                seat.setHeldUntil(null);
                toRelease.add(seat);
            }
        }
        if (!toRelease.isEmpty()) {
            seatRepository.saveAll(toRelease);
            log.info("Redis release succeeded for booking {} on {} seats", bookingId, toRelease.size());
        }
    }

    @Override
    @Transactional
    public void confirm(String eventId, List<String> seatIds, String bookingId) {
        if (seatIds == null || seatIds.isEmpty()) return;

        List<String> distinctSeatIds = seatIds.stream().distinct().toList();
        List<String> keys = distinctSeatIds.stream()
                .map(seatId -> seatKey(eventId, seatId))
                .toList();

        DefaultRedisScript<List> script = new DefaultRedisScript<>(CONFIRM_LUA, List.class);
        redisTemplate.execute(script, keys, bookingId);

        // Đồng bộ DB
        List<Seat> seats = seatRepository.findById_EventIdAndId_SeatIdIn(eventId, distinctSeatIds);
        List<Seat> toConfirm = new ArrayList<>();
        for (Seat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD && bookingId.equals(seat.getHeldByBooking())) {
                seat.setStatus(SeatStatus.SOLD);
                seat.setHeldUntil(null);
                toConfirm.add(seat);
            }
        }
        if (!toConfirm.isEmpty()) {
            seatRepository.saveAll(toConfirm);
            log.info("Redis confirm succeeded for booking {} on {} seats", bookingId, toConfirm.size());
        }
    }
}
