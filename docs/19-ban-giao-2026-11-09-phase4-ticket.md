# Báo cáo bàn giao Giai đoạn 4 - Phần 2: Ticket Service, QR Code, MinIO & Check-in

- **Ngày bàn giao**: 09/11/2026
- **Trạng thái**: Hoàn thành Giai đoạn 4 - Phần 2 (`ticket-service`, ZXing QR Code có chữ ký HMAC-SHA256 chống vé giả, MinIO Object Storage, Check-in tại cổng sự kiện, Gateway Routing, Postman 81 requests)
- **Branch**: `main`

---

## 1. Mục tiêu và kết quả đạt được

1. **Hạ tầng hỗ trợ trong `docker-compose.yml`**:
   - **MinIO**: Object storage chuẩn S3 (Port 9000 API, Port 9001 Console) lưu trữ file ảnh QR code và chứng từ vé điện tử.
   - **MailHog**: Mock SMTP server (Port 1025 SMTP, Port 8025 Web UI) sẵn sàng phục vụ `notification-service`.
2. **Microservice `ticket-service` (Port 8086)**:
   - Phát hành vé điện tử độc lập khi nhận sự kiện `PaymentSucceeded` từ Kafka topic `payment.events`.
   - **Chống làm giả vé (Anti-counterfeiting)**: Sử dụng mã băm HMAC-SHA256 (`ticket.qr.secret`) ký trên bộ dữ liệu `ticketCode:ticketId:eventId:seatCode`. Mọi hành vi sửa đổi mã vé, vị trí ghế hay mã sự kiện đều bị phát hiện ngay lập tức khi quét QR.
   - **Tạo mã QR & MinIO Storage**: Tích hợp ZXing sinh ảnh PNG QR code chuẩn 300x300, tự động tải lên bucket `ticketnow-tickets` trên MinIO (có fallback Data URI Base64 khi chạy offline).
   - **Soát vé Check-in tại cổng**:
     - `POST /api/v1/tickets/check-in`: Kiểm tra tính toàn vẹn chữ ký QR, kiểm tra trạng thái vé (`VALID` -> `USED`), lưu vết lịch sử soát vé `ticket_checkins` (người soát, thời gian, mã máy quét).
     - **Chống tái sử dụng vé (Double Check-in)**: Trả về mã lỗi HTTP `409 Conflict` nếu vé đã được check-in trước đó.
   - **Transactional Outbox**: Ghi nhận sự kiện `TicketIssued` vào bảng `outbox`, daemon `OutboxRelayService` định kỳ đẩy lên Kafka topic `ticket.events`.
3. **API Gateway (Port 8080)**:
   - Định tuyến `/api/v1/tickets/**` về `ticket-service:8086`.
   - Bảo mật qua Keycloak JWT: Yêu cầu quyền `customer` khi xem vé cá nhân, quyền `organizer`/`admin`/`staff` khi thực hiện soát vé.
4. **Postman Automation**:
   - Mở rộng lên **81 requests**, kiểm thử phủ toàn bộ **46/46 API operations**.
   - Thêm folder `09 - Tickets (customer & staff)` với 5 kịch bản vé điện tử và soát vé.

---

## 2. Chi tiết kỹ thuật & API

### 2.1. Cấu trúc bảng Database (`ticketnow_ticket`)
- `tickets`: `id`, `ticket_code` (unique), `booking_id`, `event_id`, `seat_id`, `seat_code`, `tier_name`, `price`, `currency`, `user_id`, `status` (`VALID`, `USED`, `CANCELLED`, `REFUNDED`), `qr_payload`, `qr_code_url`, `created_at`, `updated_at`.
- `ticket_checkins`: `id`, `ticket_id`, `checked_in_by`, `device_info`, `checked_in_at`.
- `outbox`: `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status`, `created_at`, `processed_at`, `retry_count`.
- `processed_events`: `event_id`, `consumer_name`, `processed_at` (Chống lặp sự kiện Kafka).

### 2.2. Danh sách Endpoints `ticket-service`
| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/v1/tickets/my-tickets` | `customer` | Lấy danh sách vé điện tử của người dùng hiện tại |
| `GET` | `/api/v1/tickets/{id}` | `customer` / `staff` | Xem chi tiết vé và lịch sử check-in |
| `GET` | `/api/v1/tickets/by-booking/{bookingId}` | `customer` / `staff` | Lấy danh sách vé theo mã đơn đặt vé |
| `POST` | `/api/v1/tickets/check-in` | `organizer` / `admin` / `staff` | Soát vé tại cổng bằng mã vé hoặc payload mã QR |
| `POST` | `/api/v1/tickets/manual-issue` | `organizer` / `admin` | Phát hành vé thủ công hoặc kiểm thử hệ thống |

---

## 3. Kết quả kiểm thử

| Module | Test Suite | Kết quả |
| --- | --- | --- |
| `ticket-service` | `QrCodeServiceTests` (3), `TicketFlowTests` (4), `TicketPaymentEventListenerTests` (1), `TicketServiceApplicationTests` (1) | **9/9 PASS** |
| `payment-service` | `PaymentFlowTests`, `PayOsPaymentAdapterTests`, `PaymentServiceApplicationTests` | **9/9 PASS** |
| `booking-service` | `BookingFlowTests`, `GrpcSeatInventoryClientTests`, `BookingPaymentEventListenerTests` | **10/10 PASS** |
| `eventservice` | Tất cả unit & integration tests | **19/19 PASS** |
| `seat-inventory` | REST, gRPC 9083, lock strategy tests | **9/9 PASS** |
| `api-gateway` | `ApiGatewayApplicationTests` | **1/1 PASS** |
| `postman` | `validate_collection.py` | **PASS 81/81 requests**, phủ **46/46 operations** |
