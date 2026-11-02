# 06 – Thiết kế dữ liệu

Nguyên tắc: Database per service; tiền dùng `NUMERIC(12,2)`; thời gian `TIMESTAMPTZ` (UTC); ID UUID (v7 nếu được). Một Postgres nhiều database khi máy yếu. `outbox` và `processed_events` có ở **mọi service dùng Kafka**.

## 1. booking-service
```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0,
  UNIQUE (user_id, idempotency_key)
);
CREATE TABLE booking_items (
  booking_id UUID REFERENCES bookings(id),
  seat_id VARCHAR(30) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (booking_id, seat_id)
);
CREATE TABLE saga_state (
  booking_id UUID PRIMARY KEY,
  current_step VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,       -- RUNNING, COMPENSATING, DONE, FAILED
  payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE outbox (
  id UUID PRIMARY KEY,
  aggregate_id VARCHAR(64) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  type VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE TABLE processed_events (
  event_id UUID PRIMARY KEY,
  consumer VARCHAR(60) NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);
```
**[Bổ sung] Bảng idempotency (response caching):**
```sql
CREATE TABLE idempotency_keys (
  user_id UUID NOT NULL,
  key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,      -- phát hiện cùng key khác nội dung → 422
  status VARCHAR(12) NOT NULL,         -- IN_PROGRESS, DONE
  response_code INT, response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
```
**Chỉ mục nên có:** `bookings(user_id, created_at DESC)`, `bookings(status, expires_at)` (quét hết hạn), `outbox(created_at) WHERE published_at IS NULL` (partial index), `saga_state(status, updated_at)`.

## 2. seat-inventory (Postgres + Redis)
```sql
CREATE TABLE seats (
  event_id UUID NOT NULL,
  seat_id VARCHAR(30) NOT NULL,       -- ví dụ A-12-07 (khu-hàng-số)
  tier_id UUID NOT NULL,
  status VARCHAR(10) NOT NULL,        -- AVAILABLE, HELD, SOLD
  held_by_booking UUID,
  held_until TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0,  -- optimistic lock
  PRIMARY KEY (event_id, seat_id)
);
CREATE INDEX idx_seats_status ON seats(event_id, status);
```
**Redis keys (theo quy ước chuẩn của mục 8.3 – key không tồn tại = ghế trống):**

| Key | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `seat:{eventId}:{seatId}` | String | `HELD:{bookingId}` (có TTL) hoặc `SOLD` (không TTL); không tồn tại = trống |
| `hold_expiry:{eventId}` | ZSet | score = epoch hết hạn, member = seatId |
| `avail:{eventId}:{tierId}` | Counter | số ghế còn, hiển thị nhanh |

**[Bổ sung] Khởi tạo Redis:** khi bật sự kiện (hoặc restart Redis), nạp lại các ghế `SOLD` và `HELD` còn hạn từ Postgres. Vì thế Postgres phải ghi đủ: `HELD` kèm `held_until`, `SOLD`.

## 3. payment-service
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL,   -- PENDING, PENDING_GATEWAY, SUCCEEDED, FAILED, REFUNDED
  gateway_ref VARCHAR(100),
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE webhook_log (
  gateway_event_id VARCHAR(100) PRIMARY KEY,  -- chống xử lý trùng
  payload JSONB, received_at TIMESTAMPTZ DEFAULT now()
);
```
**[Bổ sung]** Thêm bảng `refunds(id, payment_id UNIQUE, amount, status, created_at)` để hoàn tiền idempotent; `UNIQUE(booking_id)` trên `payments` đang SUCCEEDED (một booking một khoản thu).

## 4. ticket-service
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL,
  event_id UUID NOT NULL,
  seat_id VARCHAR(30) NOT NULL,
  owner_id UUID NOT NULL,
  qr_payload VARCHAR(500) NOT NULL,
  status VARCHAR(10) NOT NULL,   -- ISSUED, USED, REVOKED
  used_at TIMESTAMPTZ,
  UNIQUE (event_id, seat_id)
);
```
**[Bổ sung]** Khi hoàn vé rồi ghế được bán lại, `UNIQUE (event_id, seat_id)` sẽ chặn vé mới. Đổi thành chỉ mục duy nhất một phần: `CREATE UNIQUE INDEX ON tickets(event_id, seat_id) WHERE status <> 'REVOKED';`.

## 5. event-service
Bảng: `events`, `venues`, `ticket_tiers` (tên, giá, số lượng), `seat_map_sections` (venue 1-n section; mỗi section có số hàng và số ghế/hàng). Sinh `seat_id` theo công thức `{section}-{row}-{seat}` (ví dụ `A-12-07`).

## 6. notification-service
Bảng `notifications(id, user_id, type, status, attempt, created_at, sent_at, dedupe_key UNIQUE)`, `templates(code, subject, body)`. Có thể dùng MongoDB (tùy chọn).

## 7. ai-agent-service
Bảng pgvector `knowledge_chunks(id, source, chunk, embedding vector(N), metadata JSONB)`; `agent_confirmations(id, user_id, action, payload, status, expires_at)` cho human-in-the-loop; `llm_usage(ts, model, tokens_in, tokens_out, cost)`.

## 8. Quan hệ dữ liệu logic (không dùng FK xuyên service)
```
event(events) 1─n ticket_tiers 1─n seats(event_id, seat_id)
booking 1─n booking_items ──(seat_id)── seats          (tham chiếu bằng ID, không FK)
booking 1─1 payment(booking_id)
booking 1─n tickets(booking_id)
```
Dữ liệu tham chiếu chéo service chỉ là ID; dữ liệu cần hiển thị (tên sự kiện) sao chép trong payload event hoặc gọi API khi cần.
