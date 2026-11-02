# 05 – Event, Kafka, Outbox, Consumer

## 1. Envelope chuẩn
```json
{
  "eventId": "uuid",
  "type": "PaymentSucceeded",
  "version": 1,
  "occurredAt": "2026-11-02T10:00:03.120Z",
  "aggregateId": "booking-uuid",
  "traceId": "...",
  "payload": { }
}
```
- Key Kafka = `aggregateId` (đảm bảo thứ tự theo booking).
- Header `traceparent` nối trace.
- **[Bổ sung]** `version` tăng khi đổi schema; chỉ thêm trường tùy chọn (backward compatible); JSON Schema đặt ở `contracts/events/`.

## 2. Danh sách topic
| Topic | Event | Producer | Consumer | Payload chính |
| --- | --- | --- | --- | --- |
| event.events | EventCreated, EventOnSaleOpened | event | queue, notification | eventId, onSaleAt |
| seat.events | SeatsHeld, SeatsReleased, HoldExpired, SeatsSold | seat-inventory | booking, ai-agent | bookingId, eventId, seatIds, expiresAt |
| booking.events | BookingCreated, BookingConfirmed, BookingCancelled, BookingExpired | booking | notification, ticket | bookingId, userId, amount |
| payment.commands | PaymentRequested | booking | payment | bookingId, amount, idempotencyKey |
| payment.events | PaymentSucceeded, PaymentFailed, PaymentDelayed, RefundCompleted | payment | booking, notification | bookingId, paymentId, reason |
| ticket.commands | IssueTicket, RevokeTicket | booking | ticket | bookingId, seatIds |
| ticket.events | TicketIssued, TicketRevoked | ticket | booking, notification | bookingId, ticketIds |
| \*.DLT | Dead letters | Spring Kafka | Ops | bản gốc + lỗi |
| **queue.events [Bổ sung]** | QueueAdmitted | queue | ai-agent/thống kê | eventId, count |

**Quy ước:** `events` = sự thật đã xảy ra (quá khứ); `commands` = yêu cầu hành động. Tối thiểu 6 partition/topic. Consumer group đặt theo service (`booking`, `payment`, ...). **[Bổ sung]** `payment.commands`/`ticket.commands` nên có `retention` ngắn hơn và alert nếu lag > ngưỡng.

**[Bổ sung] Chọn số partition:** số consumer tối đa song song = số partition; KEDA `maxReplicaCount` không nên vượt số partition của topic nó theo dõi (`payment.events`, 6 partition → tối đa 6 replica hữu ích).

## 3. Outbox pattern
Mục tiêu: ghi nghiệp vụ và ghi event **trong cùng transaction** DB, tránh lệch khi crash.

- **Cách A (dùng cho đồ án):** `@Scheduled(fixedDelay = 200)` chọn 100 dòng `published_at IS NULL` bằng `FOR UPDATE SKIP LOCKED`, gửi Kafka, đánh dấu đã gửi. Nhiều instance chạy song song được.
- **Cách B (nâng cao):** Debezium CDC đọc bảng `outbox`.
- Outbox cho **at-least-once** → consumer bắt buộc idempotent.

```sql
-- relay
SELECT * FROM outbox
WHERE published_at IS NULL
ORDER BY created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```
**[Bổ sung] Lưu ý thứ tự:** `SKIP LOCKED` với nhiều relay có thể phá thứ tự toàn cục, nhưng Kafka chỉ cần thứ tự theo `aggregateId`. Để giữ thứ tự theo aggregate, hoặc chỉ một relay/partition-key, hoặc chấp nhận và để consumer xử lý theo trạng thái (máy trạng thái bỏ qua event cũ). **Dọn dẹp:** xóa dòng đã gửi > 7 ngày; metric `ticketnow_outbox_pending`.

## 4. Producer
`acks=all`, `enable.idempotence=true`, `max.in.flight.requests.per.connection ≤ 5`, `linger.ms` nhỏ (5-20) để batch.

## 5. Consumer idempotent
```
BEGIN;
  INSERT INTO processed_events(event_id, consumer) VALUES (?, ?)
    ON CONFLICT DO NOTHING;   -- 0 dòng → đã xử lý, bỏ qua
  ... cập nhật nghiệp vụ ...
COMMIT;
-- chỉ commit offset sau khi transaction thành công
```
Việc kiểm tra và ghi `processed_events` **cùng transaction** với cập nhật nghiệp vụ. Side-effect ngoài DB (gửi email, gọi cổng) phải có khóa idempotency riêng.

## 6. Xử lý lỗi và Dead Letter
- `DefaultErrorHandler` + `ExponentialBackOff` (3-5 lần).
- Hết lần: `DeadLetterPublishingRecoverer` → `*.DLT` (kèm header lỗi, stack trace rút gọn).
- Alert khi DLT có message (xem file 09).
- **[Bổ sung]** Phân loại lỗi: lỗi tạm thời (timeout, DB lock) → retry; lỗi vĩnh viễn (JSON sai, vi phạm nghiệp vụ) → bỏ qua retry, đi thẳng DLT (`addNotRetryableExceptions`).
- **[Bổ sung]** Công cụ replay DLT: endpoint Ops hoặc script đọc DLT, đẩy lại topic gốc sau khi sửa lỗi.

## 7. Bảo đảm giao nhận (câu trả lời bảo vệ)
Không đạt exactly-once end-to-end; đạt **at-least-once + idempotent consumer** ⇒ hiệu ứng tương đương exactly-once với side-effect trong DB.
