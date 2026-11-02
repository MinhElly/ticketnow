# 07 – Chống bán trùng ghế: 3 chiến lược và benchmark

Đây là phần trọng tâm học thuật. Cài cả ba sau interface `SeatLockStrategy`, chọn bằng `seat.lock.strategy=pessimistic|optimistic|redis` (đổi nóng bằng `@RefreshScope`), đo bằng k6.

```java
public interface SeatLockStrategy {
    HoldResult hold(UUID eventId, List<String> seatIds, UUID bookingId, Duration ttl);
    void release(UUID eventId, List<String> seatIds, UUID bookingId);
    void confirm(UUID eventId, List<String> seatIds, UUID bookingId);
}
```

## A. Pessimistic lock (Postgres)
```sql
SELECT seat_id FROM seats
WHERE event_id = :eventId AND seat_id IN (:seatIds) AND status = 'AVAILABLE'
ORDER BY seat_id          -- thứ tự cố định để tránh deadlock
FOR UPDATE;
-- số dòng != số ghế yêu cầu → rollback, trả failed_seat_ids
UPDATE seats SET status='HELD', held_by_booking=:b, held_until=now()+interval '10 minutes'
WHERE event_id=:eventId AND seat_id IN (:seatIds);
```
- Ưu: đơn giản, đúng chắc chắn.
- Nhược: nghẽn khi tranh chấp cao, giữ connection lâu → cạn pool.
- **[Bổ sung]** Dùng `FOR UPDATE SKIP LOCKED` không phù hợp (cần all-or-nothing); thay vào đó đặt `lock_timeout` ngắn (ví dụ 200 ms) để fail nhanh.

## B. Optimistic lock
```sql
UPDATE seats SET status='HELD', held_by_booking=:b, version=version+1
WHERE event_id=:e AND seat_id=:s AND status='AVAILABLE' AND version=:v;
-- affected rows = 0 → thất bại
```
Nhiều ghế: gom một transaction, một ghế fail → rollback toàn bộ. Retry tối đa 2 lần. Tốt khi ít tranh chấp, kém với hot seat.

## C. Redis + Lua (khuyến nghị cho đường nóng)
Quy ước: key không tồn tại = trống; `HELD:{bookingId}` có TTL; `SOLD` không TTL. Tự nhả khi hết hạn, không cần khởi tạo trước. Dùng hash tag `seat:{eventId}:A-12-07` để mọi ghế một sự kiện cùng slot (Redis Cluster).

```lua
-- KEYS = các seat key; ARGV[1] = bookingId; ARGV[2] = ttl giây
for _, k in ipairs(KEYS) do
  if redis.call('EXISTS', k) == 1 then return {0, k} end
end
for _, k in ipairs(KEYS) do
  redis.call('SET', k, 'HELD:' .. ARGV[1], 'EX', ARGV[2])
end
return {1}
```
**[Bổ sung] Phiên bản hoàn chỉnh** (đưa `hold_expiry` vào cùng script, hỗ trợ gọi lại cùng booking):
```lua
-- KEYS[1] = hold_expiry:{eventId}; KEYS[2..n] = seat keys
-- ARGV[1] = bookingId; ARGV[2] = ttl; ARGV[3] = expireAtEpoch; ARGV[4..] = seatIds
local mine = 'HELD:' .. ARGV[1]
for i = 2, #KEYS do
  local v = redis.call('GET', KEYS[i])
  if v and v ~= mine then return {0, KEYS[i]} end
end
for i = 2, #KEYS do
  redis.call('SET', KEYS[i], mine, 'EX', ARGV[2])
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[i + 2])
end
return {1}
```
Script **confirm** (HELD → SOLD, chỉ khi còn đúng chủ):
```lua
for _, k in ipairs(KEYS) do
  if redis.call('GET', k) ~= 'HELD:' .. ARGV[1] then return {0, k} end
end
for _, k in ipairs(KEYS) do redis.call('SET', k, 'SOLD') end   -- bỏ TTL
return {1}
```
Script **release**: xóa key nếu giá trị = `HELD:{bookingId}` (không xóa ghế của người khác).

**Vòng đời sau hold:** ghi Postgres + phát `SeatsHeld` qua Outbox (bất đồng bộ); job đối soát mỗi phút. **Rủi ro:** Redis mất dữ liệu → có thể bán trùng nếu không khôi phục. Giảm bằng: bật AOF `everysec`, khi khởi động lại nạp trạng thái từ Postgres trước khi nhận hold, và `ticket.UNIQUE` là chốt chặn cuối.

## Ba lớp phòng thủ (câu trả lời bảo vệ)
1. Redis Lua: quyết định nhanh, nguyên tử.
2. Postgres `seats` (PK `(event_id, seat_id)`): bản ghi bền, `UPDATE ... WHERE status` kiểm tra lại.
3. `tickets UNIQUE(event_id, seat_id)`: không thể có hai vé cho một ghế.

## So sánh lý thuyết
| Tiêu chí | Pessimistic | Optimistic | Redis Lua |
| --- | --- | --- | --- |
| Tranh chấp cao | Xếp hàng, nghẽn | Nhiều retry/fail | Tốt (single-thread) |
| Độ bền | Cao | Cao | Cần đối soát |
| Tải DB | Cao | Trung bình | Thấp |
| Độ phức tạp | Thấp | Thấp | Trung bình |

## Kế hoạch benchmark
| Kịch bản | Mô tả |
| --- | --- |
| S1 | 1.000 VU tranh 100 ghế |
| S2 | 20.000 VU tranh 2.000 ghế (mở bán thật) |
| S3 | Hot seat: mọi VU giữ 1 ghế |
| S4 | Phân tán: mỗi VU một ghế khác nhau |

Mẫu bảng kết quả (mỗi ô chạy 3 lần lấy trung vị; ghi cấu hình máy):

| Chiến lược | Kịch bản | Throughput (req/s) | p50 | p95 | p99 | Ghế trùng | CPU DB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pessimistic | S1..S4 | | | | | 0 | |
| Optimistic | S1..S4 | | | | | 0 | |
| Redis Lua | S1..S4 | | | | | 0 | |

**Truy vấn kiểm tra sau test:**
```sql
-- ghế có > 1 booking đã CONFIRMED
SELECT bi.seat_id, b.event_id, count(*) FROM booking_items bi
JOIN bookings b ON b.id = bi.booking_id
WHERE b.status = 'CONFIRMED'
GROUP BY bi.seat_id, b.event_id HAVING count(*) > 1;
-- tổng SOLD không vượt sức chứa
SELECT count(*) FROM seats WHERE event_id = :e AND status = 'SOLD';
```
**Cách đo công bằng:** cố định CPU/RAM container; warm-up 30 s; reset dữ liệu giữa các lần; cùng một script k6, chỉ đổi `seat.lock.strategy`; ghi cả `hikaricp_connections_active` để thấy pool cạn ở chiến lược A.
