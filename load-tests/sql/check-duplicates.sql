-- Chạy sau mỗi lần benchmark để chứng minh không bán trùng.
-- Hai database được tham chiếu đầy đủ: ticketnow_booking và ticketnow_inventory.
-- Ví dụ:
--   docker exec -i ticketnow-mariadb mariadb -uroot -p"$env:DB_ROOT_PASSWORD" < load-tests/sql/check-duplicates.sql
-- Đổi @event_id cho đúng event benchmark.

SET @event_id = 'bench-event';

-- (1) Một ghế có > 1 booking CONFIRMED: phải trả về 0 dòng.
SELECT bi.seat_id, b.event_id, COUNT(*) AS confirmed_bookings
FROM ticketnow_booking.booking_items bi
JOIN ticketnow_booking.bookings b ON b.id = bi.booking_id
WHERE b.event_id = @event_id
  AND b.status = 'CONFIRMED'
GROUP BY bi.seat_id, b.event_id
HAVING COUNT(*) > 1;

-- (2) Tổng số ghế SOLD của event không được vượt số ghế đã seed.
SELECT COUNT(*) AS sold_seats
FROM ticketnow_inventory.seats
WHERE event_id = @event_id
  AND status = 'SOLD';

-- (3) Không còn ghế HELD quá hạn sau khi worker HoldExpired chạy.
SELECT COUNT(*) AS stale_held_seats
FROM ticketnow_inventory.seats
WHERE event_id = @event_id
  AND status = 'HELD'
  AND held_until < UTC_TIMESTAMP();

-- (4) Phân bố trạng thái để đưa vào báo cáo.
SELECT status, COUNT(*) AS seat_count
FROM ticketnow_inventory.seats
WHERE event_id = @event_id
GROUP BY status
ORDER BY status;
