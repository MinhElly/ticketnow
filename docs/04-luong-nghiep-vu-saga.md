# 04 – Luồng nghiệp vụ và Saga

## 1. Luồng vào hàng đợi
1. Khách mở trang sự kiện `ON_SALE` có `waiting-room.enabled=true`.
2. Client `POST /queue/{eventId}/join`, mở SSE tới `/status`.
3. queue-service admit theo tốc độ cấu hình; tới lượt, gửi `queueToken` qua SSE.
4. Client gửi `X-Queue-Token` cho các API tiếp theo; Gateway từ chối (403) nếu thiếu/hết hạn.

## 2. Saga đặt vé thành công
```
Client  Gateway  Booking   SeatInv(gRPC)  Kafka   Payment   Ticket   Notif
 |-POST /bookings->|          |             |        |         |        |
 |         |------>| tạo booking PENDING     |        |         |        |
 |         |       |-HoldSeats->|            |        |         |        |
 |         |       |<-success---|            |        |         |        |
 |         |       | booking=AWAITING_PAYMENT|        |         |        |
 |<-201 {bookingId, expiresAt}--|            |        |         |        |
 |-thanh toán (Idempotency-Key)------------->|        |         |        |
 |         |       |   [Outbox] PaymentRequested ---->|         |        |
 |         |       |<------- PaymentSucceeded --------|         |        |
 |         |       | PAID; ConfirmSeats (SOLD)        |         |        |
 |         |       |-IssueTicket (command) ---------------------->|       |
 |         |       |<------- TicketIssued ---------------------|        |
 |         |       | CONFIRMED; BookingConfirmed ------------------>| email
```
**[Bổ sung] Cách thống nhất:** client gọi `POST /bookings/{id}/pay` (hoặc payment qua booking); booking phát `PaymentRequested` từ Outbox. Xem mục chưa nhất quán #1, #2 ở file 00.

## 3. Bảng bước Saga và compensation
| Bước | Hành động | Compensation nếu lỗi |
| --- | --- | --- |
| 1 | Hold ghế (gRPC đồng bộ) | Không (chưa có gì để hoàn) |
| 2 | Tạo giao dịch thanh toán | ReleaseSeats |
| 3 | Xác nhận thanh toán | ReleaseSeats, hủy booking |
| 4 | ConfirmSeats (HELD → SOLD) | Refund + ReleaseSeats |
| 5 | Phát hành vé | Refund + ReleaseSeats |
| 6 | Hoàn tất, gửi thông báo | Không (best effort, retry) |

**Mô hình `saga_state`:** mỗi bước ghi `current_step`, `status` (RUNNING, COMPENSATING, DONE, FAILED) và `payload` trong **cùng transaction** với việc ghi Outbox. Khi khởi động lại, một recovery job quét Saga `RUNNING/COMPENSATING` quá hạn (ví dụ `updated_at < now()-30s`) rồi tiếp tục bước dang dở. Mỗi bước phải idempotent.

**[Bổ sung] Bảng chuyển bước (rút gọn)**
| Trạng thái hiện tại | Sự kiện vào | Hành động | Trạng thái kế |
| --- | --- | --- | --- |
| PENDING | HoldSeats OK | lưu items, phát PaymentRequested khi user thanh toán | AWAITING_PAYMENT |
| PENDING | HoldSeats fail | trả 409 | CANCELLED |
| AWAITING_PAYMENT | PaymentSucceeded | ConfirmSeats, phát IssueTicket | PAID |
| AWAITING_PAYMENT | PaymentFailed | ReleaseSeats | PAYMENT_FAILED |
| AWAITING_PAYMENT | HoldExpired | đánh dấu | EXPIRED |
| EXPIRED | PaymentSucceeded (trễ) | phát Refund | EXPIRED + REFUNDED |
| PAID | TicketIssued | phát BookingConfirmed | CONFIRMED |
| PAID | ticket lỗi quá ngưỡng | Refund + ReleaseSeats/RevertSold | REFUNDED |

## 4. Luồng lỗi phải xử lý và test
| Tình huống | Hành vi mong đợi |
| --- | --- |
| Hai người cùng giữ 1 ghế | Một thành công, người kia nhận `failed_seat_ids` (409) |
| Hold hết hạn trước khi thanh toán | `HoldExpired` → `EXPIRED`; payment tới trễ thì tự hoàn tiền |
| Payment chậm/chết | Breaker OPEN, trả 202 "đang xử lý", `PaymentDelayed`, retry nền |
| Webhook gọi 3 lần | Xử lý 1 lần (idempotency + unique key) |
| Bấm thanh toán 2 lần | Cùng `Idempotency-Key` trả kết quả cũ |
| booking-service chết giữa Saga | Khởi động lại, đọc `saga_state`, tiếp tục |
| Kafka tạm thời down | Event nằm trong outbox, relay gửi lại khi Kafka lên |
| Consumer lỗi liên tục | Chuyển DLT, có alert |
| ticket-service phát hành lỗi | Retry; quá ngưỡng thì Saga hoàn tiền |

## 5. Hết hạn giữ ghế
- Redis key `hold:{eventId}:{seatId}` TTL 10 phút (+5 s đệm).
- Phát hiện hết hạn: keyspace notification **hoặc** ZSET `hold_expiry` + scheduler quét mỗi giây (ổn định hơn, khuyến nghị) → phát `HoldExpired` qua Outbox.
- booking nhận `HoldExpired` → `EXPIRED`, nhắn notification.
- Job đối soát mỗi phút: so khớp Redis và Postgres để phát hiện ghế kẹt.
- **[Bổ sung] Cảnh báo sắp hết hạn:** job quét `hold_expiry` còn ≤ 2 phút phát `HoldExpiringSoon` (một lần/booking).
- **[Bổ sung] Race hết hạn–thanh toán:** `ConfirmSeats` kiểm `HELD:{bookingId}` còn khớp. Nếu không khớp → trả lỗi `HOLD_LOST`, Saga đi nhánh hoàn tiền (đã có ở tình huống #2).

## 6. Luồng hoàn vé
1. Khách `POST /bookings/{id}/refund` (hoặc qua Customer Agent có xác nhận).
2. booking kiểm tra chính sách (thời gian, trạng thái `CONFIRMED`).
3. Phát `RevokeTicket` + `RefundRequested` **[Bổ sung]**; ticket → `REVOKED`; payment hoàn tiền (idempotent theo `bookingId`).
4. `RefundCompleted` → booking `REFUNDED`, gọi `RevertSold` nhả ghế, notification gửi email.
