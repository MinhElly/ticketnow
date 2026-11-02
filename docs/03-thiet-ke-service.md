# 03 – Thiết kế chi tiết từng service

Mọi service dùng: Flyway, Actuator (`/actuator/health/{liveness,readiness}`, `/actuator/prometheus`), RFC 7807 cho lỗi, `traceId` trong log. Service dùng Kafka có thêm `outbox` + `processed_events`.

## 1. event-service (8081)
**Trách nhiệm:** sự kiện, địa điểm, hạng vé, sơ đồ ghế, thời điểm mở bán.

| Method | Endpoint | Mô tả | Quyền |
| --- | --- | --- | --- |
| GET | /api/events?query=&from=&to=&page= | Danh sách/tìm kiếm | public |
| GET | /api/events/{id} | Chi tiết | public |
| GET | /api/events/{id}/seatmap | Sơ đồ ghế (Redis cache TTL 30 s) | public |
| POST | /api/events | Tạo sự kiện | organizer |
| PUT | /api/events/{id}/on-sale | Đặt thời điểm mở bán, bật waiting room | organizer |

- **Event phát ra:** `EventCreated`, `EventOnSaleOpened` (topic `event.events`).
- **Khi tạo sự kiện:** gọi gRPC seat-inventory để khởi tạo toàn bộ ghế. **[Bổ sung]** thêm RPC `InitializeSeats(event_id, repeated SeatSpec)` hoặc streaming, chia batch ≤ 1.000 ghế, idempotent theo `(event_id, seat_id)`; nếu lỗi giữa chừng thì event ở trạng thái `DRAFT`, chỉ chuyển `PUBLISHED` khi khởi tạo xong.
- **Kỹ thuật:** cache-aside Redis, `Cache-Control` + ETag cho danh sách, `@RefreshScope` cho `onsale.waiting-room.enabled`.
- **Trạng thái sự kiện [Bổ sung]:** `DRAFT → PUBLISHED → ON_SALE → CLOSED/CANCELLED`.
- **Seatmap và tính chính xác:** seatmap cache 30 s chỉ để hiển thị; trạng thái thật do seat-inventory quyết định tại thời điểm hold. Có thể gộp `avail:{eventId}:{tierId}` để hiển thị số còn lại.

## 2. queue-service (8082)
**Trách nhiệm:** hàng đợi ảo, giới hạn số người đồng thời vào luồng đặt vé.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| POST | /api/queue/{eventId}/join | Vào hàng, trả `ticketNo` + vị trí |
| GET | /api/queue/{eventId}/status | SSE: vị trí, ETA; tới lượt trả `queueToken` |
| DELETE | /api/queue/{eventId}/leave | Rời hàng |

**Cơ chế**
- Redis ZSET `queue:{eventId}`, score = số thứ tự từ `INCR` (tránh trùng timestamp).
- Scheduler mỗi giây admit N người đầu (N từ Config Server, ví dụ 200/s) có khóa phân tán khi chạy nhiều instance (Redis `SET NX PX` hoặc ShedLock).
- `queueToken` = JWT ký bởi queue-service, claims `userId`, `eventId`, `exp` (15 phút). Gateway xác minh chữ ký ở `/api/bookings/**` và `/api/seats/**`.
- Chống chen hàng: mỗi user một vị trí (dựa `userId` từ JWT Keycloak). `join` lặp lại trả lại vị trí cũ.
- **[Bổ sung] Khóa ký:** dùng khóa bất đối xứng (RS256/ES256); Gateway chỉ giữ public key. Có thể cache JWKS.
- **[Bổ sung] Người rời/AFK:** nếu SSE ngắt > 30 s thì loại khỏi ZSET (heartbeat key TTL) để không "giữ chỗ ma".
- **Event phát ra:** `QueueAdmitted` (thống kê) → topic `queue.events` **[Bổ sung]**.

## 3. seat-inventory-service (8083, gRPC 9083)
**Trách nhiệm:** nguồn sự thật về trạng thái ghế và việc giữ ghế.

**Trạng thái:** `AVAILABLE → HELD → SOLD`; `HELD → AVAILABLE` (hết hạn/hủy); `SOLD → AVAILABLE` (hoàn vé).

```proto
service SeatInventory {
  rpc HoldSeats(HoldRequest) returns (HoldResponse);       // all-or-nothing
  rpc ReleaseSeats(ReleaseRequest) returns (Empty);        // compensation
  rpc ConfirmSeats(ConfirmRequest) returns (Empty);        // HELD -> SOLD
  rpc GetAvailability(AvailabilityRequest) returns (AvailabilityResponse);
  // [Bổ sung]
  rpc InitializeSeats(InitSeatsRequest) returns (Empty);
  rpc RevertSold(RevertRequest) returns (Empty);           // SOLD -> AVAILABLE khi hoàn vé
}
message HoldRequest { string event_id=1; repeated string seat_ids=2; string booking_id=3; string user_id=4; int32 ttl_seconds=5; }
message HoldResponse { bool success=1; repeated string failed_seat_ids=2; int64 expires_at_epoch=3; }
```
- **Lưu trữ:** Redis quyết định (nhanh, atomic); Postgres là bản ghi bền (qua Outbox/bất đồng bộ). Chi tiết file 07.
- **Event:** `SeatsHeld`, `SeatsReleased`, `HoldExpired`, `SeatsSold` → `seat.events`.
- **Idempotency gRPC [Bổ sung]:** `HoldSeats` gọi lại cùng `booking_id` trả kết quả cũ (không giữ lần hai); `ReleaseSeats`/`ConfirmSeats` lặp lại là no-op.

## 4. booking-service (8084)
**Trách nhiệm:** tạo booking, điều phối Saga, lưu trạng thái.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| POST | /api/v1/bookings | Tạo booking (`Idempotency-Key` bắt buộc, `X-Queue-Token` nếu waiting room bật) |
| GET | /api/v1/bookings/{id} | Chi tiết/trạng thái |
| GET | /api/v1/bookings/me | Booking của tôi |
| POST | /api/v1/bookings/{id}/cancel | Hủy khi chưa thanh toán |
| POST | /api/v1/bookings/{id}/refund | Yêu cầu hoàn vé |

**Máy trạng thái:**
```
PENDING → SEATS_HELD → AWAITING_PAYMENT → PAID → TICKET_ISSUED → CONFIRMED
Nhánh lỗi: CANCELLED, EXPIRED, PAYMENT_FAILED, REFUNDED
```
Chuyển trạng thái chỉ qua một nơi (State machine trong `domain/`), dùng optimistic lock (`version`) ở bảng `bookings`.

## 5. payment-service (8085)
**Trách nhiệm:** tạo giao dịch, gọi cổng mock, nhận webhook, hoàn tiền.

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| POST | /api/payments | Tạo thanh toán (`Idempotency-Key`) |
| POST | /api/payments/webhook | Cổng mock gọi về, xác thực HMAC |
| POST | /api/payments/{id}/refund | Hoàn tiền |

- **Mock Payment Gateway:** service riêng (hoặc WireMock): độ trễ 100 ms-8 s, tỉ lệ lỗi 0-50%, chế độ "chết hẳn", webhook trễ/trùng; điều khiển qua API "chaos".
- **Resilience:** CircuitBreaker + TimeLimiter + Bulkhead; fallback ghi `PENDING_GATEWAY` và phát `PaymentDelayed`.
- **Event:** `PaymentSucceeded`, `PaymentFailed`, `PaymentDelayed`, `RefundCompleted` → `payment.events`.
- **Webhook an toàn [Bổ sung]:** HMAC trên raw body + header timestamp, từ chối lệch > 5 phút (chống replay), so sánh hằng thời gian.

## 6. ticket-service (8086)
**Trách nhiệm:** phát hành vé, sinh QR, lưu MinIO, soát vé.

| Method | Endpoint | Mô tả | Quyền |
| --- | --- | --- | --- |
| GET | /api/tickets/me | Vé của tôi | customer |
| GET | /api/tickets/{id}/qr | Ảnh QR | owner |
| POST | /api/tickets/scan | Quét QR | gate-staff |

- QR payload: chuỗi ngắn chứa `ticketId` + chữ ký HMAC/JWT; không chứa dữ liệu cá nhân.
- Soát vé: `UPDATE tickets SET status='USED', used_at=now() WHERE id=? AND status='ISSUED'`; số dòng = 1 mới hợp lệ.
- Phát hành idempotent nhờ `UNIQUE (event_id, seat_id)` + `processed_events`.
- Event: `TicketIssued`, `TicketRevoked` → `ticket.events`.

## 7. notification-service (8087)
Consume `BookingConfirmed`, `HoldExpiringSoon`, `PaymentFailed`, `RefundCompleted`, `TicketIssued`; gửi email SMTP (MailHog); lưu lịch sử gửi và template. Retry cấp số nhân; sau N lần → DLT. **[Bổ sung]** dedupe theo `(eventId, channel)` để không gửi email trùng khi consumer chạy lại.

## 8. ai-agent-service (8088)
Xem file 11.

## 9. Hạ tầng dùng chung
| Thành phần | Ghi chú |
| --- | --- |
| discovery-server | Eureka, chỉ Compose; bỏ khi lên K8s |
| config-server | Repo Git `ticketnow-config`: `application.yml`, `{service}-{profile}.yml` |
| api-gateway | Route, JWT, rate limit, `QueueTokenFilter`, correlation-id |
| mock-payment-gateway | Giả cổng, có "điều khiển hỗn loạn" qua API |
| common-lib (tùy chọn) | DTO event, envelope, cấu hình tracing; giữ nhỏ, tránh coupling |

## 10. Ma trận phụ thuộc
| Service | Gọi đồng bộ | Publish | Consume |
| --- | --- | --- | --- |
| event | seat-inventory (gRPC) | event.events | - |
| queue | - | queue.events | event.events |
| seat-inventory | - | seat.events | - |
| booking | seat-inventory (gRPC) | booking.events, payment.commands, ticket.commands | seat.events, payment.events, ticket.events |
| payment | cổng mock (HTTP) | payment.events | payment.commands |
| ticket | MinIO | ticket.events | ticket.commands |
| notification | SMTP | - | booking/payment/ticket/seat events |
| ai-agent | event, seat, booking, ticket, Prometheus/Loki/Tempo | - | seat.events (thống kê) |
