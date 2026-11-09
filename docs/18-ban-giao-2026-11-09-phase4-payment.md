# Báo cáo bàn giao Giai đoạn 4: Payment Service, PayOS VietQR & Kafka Saga

- **Ngày bàn giao**: 09/11/2026
- **Trạng thái**: Hoàn thành Giai đoạn 4 - Phần 1 (Payment, PayOS VietQR / Mock Gateway, Kafka Outbox & Saga Consumer)
- **Branch**: `main`

---

## 1. Mục tiêu và kết quả đạt được

Theo lộ trình thiết kế kiến trúc và yêu cầu bảo vệ đồ án tốt nghiệp:
1. **Hạ tầng Messaging Event-Driven**: Triển khai Apache Kafka KRaft mode trong Docker Compose (`deploy/compose/docker-compose.yml`) phục vụ luồng Saga phân tán.
2. **Microservice `payment-service` (Port 8085)**:
   - Xây dựng hoàn chỉnh microservice thanh toán độc lập sử dụng Spring Boot 4 (Java 17).
   - Thiết kế theo **Strategy/Adapter Pattern** hỗ trợ song song 2 Gateway:
     - **PayOS Adapter**: Tích hợp cổng thanh toán thực PayOS (VietQR chuẩn EMVCo), tạo checkoutUrl, ký và xác thực chữ ký HMAC-SHA256 (`PAYOS_CHECKSUM_KEY`) theo cơ chế constant-time equality check (`MessageDigest.isEqual`).
     - **Mock Adapter**: Giả lập thanh toán tức thì với delay/failure rate có thể cấu hình để phục vụ k6 load test / chaos engineering.
   - **Transactional Outbox Pattern**: Lưu trạng thái thanh toán và bản ghi sự kiện `outbox` trong cùng transaction DB; background daemon `OutboxRelayService` định kỳ quét và publish sự kiện `PaymentSucceeded` / `PaymentFailed` lên topic `payment.events`.
3. **Saga Consumer tại `booking-service` (Port 8084)**:
   - Lắng nghe topic `payment.events`.
   - Cơ chế Idempotent Consumer thông qua bảng `processed_events` (Flyway V2).
   - Tự động chuyển trạng thái đơn đặt vé (`CONFIRMED` khi thanh toán thành công, `CANCELLED` và nhả vé khi thanh toán thất bại) không phụ thuộc Security Context người dùng.
4. **API Gateway (Port 8080)**: Định tuyến `/api/v1/payments/**` về `payment-service:8085`, cấu hình whitelist cho các webhook công khai `/api/v1/payments/webhook` và `/mock/**`.
5. **Postman & Kiểm thử tự động**:
   - Mở rộng Postman collection lên **75 requests** phủ **41/41 API endpoints**.
   - Thêm folder `08 - Payments (customer)` với 5 kịch bản thanh toán đầy đủ.
   - 100% unit tests và integration tests đều pass.

---

## 2. Chi tiết triển khai

### 2.1. Cấu hình Kafka KRaft Mode
Tệp [docker-compose.yml](file:///C:/Code/ticketnow/deploy/compose/docker-compose.yml):
- Image: `apache/kafka:3.8.0` (KRaft mode không cần ZooKeeper phụ thuộc).
- Port 9092 (broker ngoài host), internal controller 9093.
- Định nghĩa topic `payment.events`.

### 2.2. Microservice `payment-service`
Tệp cấu hình & mã nguồn:
- **Port**: `8085`
- **Flyway Migration** `V1__create_payment_schema.sql`:
  - `payments`: `id`, `booking_id`, `user_id`, `amount`, `currency`, `provider`, `status`, `order_code`, `checkout_url`, `qr_code`, `transaction_id`.
  - `outbox`: `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status`, `created_at`, `processed_at`, `retry_count`.
  - `processed_events`: Quản lý sự kiện trùng lặp (Idempotent Consumer).
- **Core Entities & Repositories**:
  - `Payment`, `OutboxMessage`, `ProcessedEvent`.
- **Payment Adapters**:
  - `PayOsPaymentAdapter`:
    - Tạo đơn thanh toán qua PayOS API `/v2/payment-requests`.
    - Sinh mã `orderCode` số nguyên dương duy nhất (tối đa 14 chữ số).
    - Tính mã băm HMAC-SHA256 theo chuỗi tham số sắp xếp bảng chữ cái (`amount=...&cancelUrl=...&description=...&orderCode=...&returnUrl=...`).
    - Xác thực webhook chữ ký HMAC-SHA256 với khóa `PAYOS_CHECKSUM_KEY`.
  - `MockPaymentAdapter`:
    - Giả lập URL thanh toán `https://checkout.ticketnow.vn/mock-pay/{orderCode}`.
    - Sinh mã VietQR EMVCo giả lập `00020101021238540010A00000072701260006970422...`.
  - `PaymentGatewayFactory`: Tự động chọn Adapter dựa trên cấu hình `payment.gateway.provider` (mặc định `MOCK`, chuyển `PAYOS` khi cung cấp sandbox credentials).
- **Outbox Relay**:
  - `OutboxRelayService`: Quét các bản ghi outbox có trạng thái `PENDING`, serialize envelope JSON theo schema chuẩn và đẩy lên Kafka topic `payment.events`.
- **REST Controller**:
  - `POST /api/v1/payments`: Khởi tạo thanh toán cho booking.
  - `GET /api/v1/payments/{id}`: Xem chi tiết giao dịch thanh toán.
  - `GET /api/v1/payments/by-booking/{bookingId}`: Tra cứu thanh toán theo mã booking.
  - `POST /api/v1/payments/webhook`: Nhận webhook thông báo thanh toán (Public).
  - `POST /api/v1/payments/mock/simulate-success/{orderCode}`: Giả lập thanh toán thành công trong môi trường Dev/Test.

### 2.3. Saga Orchestration tại `booking-service`
- **Flyway Migration** `V2__add_processed_events.sql`: Bổ sung bảng `processed_events` để đảm bảo Exactly-Once processing cho Kafka event.
- **Consumer** `BookingPaymentEventListener`:
  - Lắng nghe Kafka topic `payment.events`.
  - Kiểm tra xem `event_id` đã tồn tại trong `processed_events` chưa (chống replay attack/duplicate events).
  - Khi nhận `PaymentSucceeded`: Gọi `confirmBookingFromPayment(bookingId)` -> Cập nhật trạng thái `CONFIRMED`.
  - Khi nhận `PaymentFailed`: Gọi `cancelBookingFromPayment(bookingId)` -> Cập nhật trạng thái `CANCELLED` và giải phóng ghế trên `seat-inventory`.

### 2.4. Định tuyến API Gateway
Tệp [application.yaml](file:///C:/Code/ticketnow/api-gateway/src/main/resources/application.yaml) & [SecurityConfig.java](file:///C:/Code/ticketnow/api-gateway/src/main/java/com/minh/gateway/SecurityConfig.java):
- Thêm Route:
  ```yaml
  - id: payment-service
    uri: http://localhost:8085
    predicates:
      - Path=/api/v1/payments/**
  ```
- Cấu hình Security WebFlux: Whitelist `/api/v1/payments/webhook` và `/api/v1/payments/mock/**` không bắt buộc Bearer token. Các endpoint còn lại bắt buộc xác thực Keycloak JWT.

---

## 3. Kết quả kiểm thử

| Module / Hạng mục | Test Suites | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| `payment-service` | `PaymentFlowTests`, `PayOsPaymentAdapterTests`, `PaymentServiceApplicationTests` | **9/9 PASS** | Kiểm tra tạo payment, tính toán signature HMAC-SHA256, verify webhook, outbox relay. |
| `booking-service` | `BookingFlowTests`, `GrpcSeatInventoryClientTests`, `BookingPaymentEventListenerTests`, `BookingServiceApplicationTests` | **10/10 PASS** | Bao gồm test Saga Event Listener xử lý `PaymentSucceeded` và chặn duplicate event. |
| `api-gateway` | `ApiGatewayApplicationTests` | **1/1 PASS** | Context load & routing verification. |
| `eventservice` | `GrpcSeatInventoryClientTests`, các unit/integration tests | **19/19 PASS** | 1 MariaDB test skip (opt-in). |
| `seat-inventory` | Controller, Service, Worker, gRPC Server tests | **9/9 PASS** | REST & gRPC 9083. |
| `postman` | `validate_collection.py` | **PASS** | **75 requests**, phủ **41/41** controller endpoints. Không rò rỉ token hay hardcoded password. |

---

## 4. Hướng dẫn thiết lập & Chạy thử nghiệm

### 4.1. Biến môi trường cho PayOS (Tùy chọn khi chạy với PayOS Sandbox thật)
Nếu muốn chạy với PayOS thật, thêm các biến sau vào môi trường:
```bash
PAYMENT_GATEWAY_PROVIDER=PAYOS
PAYOS_CLIENT_ID=<your-payos-client-id>
PAYOS_API_KEY=<your-payos-api-key>
PAYOS_CHECKSUM_KEY=<your-payos-checksum-key>
```
Nếu không cấu hình, `payment-service` mặc định chạy chế độ `MOCK`, cho phép test cục bộ không cần tài khoản PayOS.

### 4.2. Khởi động dịch vụ
```bash
# 1. Khởi động hạ tầng cơ sở dữ liệu và Kafka
docker compose -f deploy/compose/docker-compose.yml up -d mariadb redis kafka keycloak

# 2. Chạy payment-service
mvn spring-boot:run -f payment-service/pom.xml

# 3. Chạy booking-service
mvn spring-boot:run -f booking-service/pom.xml
```

---

## 5. Kế hoạch tiếp theo (Giai đoạn 4 - Phần 2)

1. **`ticket-service` (Port 8086)**:
   - Lắng nghe sự kiện `BookingConfirmed` / `PaymentSucceeded`.
   - Sinh vé điện tử dạng mã QR (chuẩn mã hóa AES / HMAC).
   - Tích hợp lưu trữ MinIO / S3 cho template vé và file PDF.
   - Endpoint soát vé check-in tại cổng sự kiện (`POST /api/v1/tickets/check-in`).
2. **`notification-service` (Port 8087)**:
   - Lắng nghe sự kiện thanh toán và phát hành vé.
   - Gửi email hóa đơn & vé điện tử kèm file QR đính kèm qua SMTP (MailHog).
3. **End-to-end Automation Validation**:
   - Chạy Newman kịch bản 75 requests với trọn vẹn chu trình: Tổ chức sự kiện -> Giữ chỗ -> Đặt vé -> Thanh toán VietQR -> Phát hành vé -> Check-in.
