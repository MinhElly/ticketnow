# Hoàn Thiện Luồng Dữ Liệu Nối Backend Microservices và Frontend Next.js

Tài liệu này tổng hợp thiết kế kiến trúc, cấu hình và luồng dữ liệu end-to-end đã hoàn thiện để kết nối toàn bộ hệ thống Backend Spring Boot Microservices (thông qua API Gateway `http://localhost:8080`) với Frontend Next.js 15 App Router (`http://localhost:3000`).

---

## 1. Sơ đồ kiến trúc luồng dữ liệu End-to-End

```
+-----------------------------------------------------------------------------------------+
|                                    FRONTEND (Next.js 15)                                |
|                                                                                         |
|  [Đăng nhập / Session]       [Chi tiết sự kiện]         [Giữ chỗ & Checkout]            |
|  /api/ticketnow/session       /events/[slug]             /checkout/[id]                 |
|          |                           |                           |                      |
|          v                           v                           v                      |
|  [fetchGateway]              [availability API]          [/api/ticketnow/bookings]      |
|  (Bearer app-session JWT)     /api/ticketnow/availability (hold, pay, cancel)           |
+----------+---------------------------+---------------------------+---------------------+
           |                           |                           |
           +---------------------------+---------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------------+
|                            SPRING CLOUD API GATEWAY (Port 8080)                         |
|                       (Keycloak JWT Authentication & Route Routing)                     |
+---+--------------------+--------------------+--------------------+------------------+---+
    |                    |                    |                    |                  |
    v                    v                    v                    v                  v
+----------+       +------------+       +-------------+      +-------------+    +-------------+
|  Event   |       |    Seat    |       |   Booking   |      |   Payment   |    |   Ticket    |
| Service  |       | Inventory  |       |   Service   |      |   Service   |    |   Service   |
| (Port    |       | (Port 8083 |       | (Port 8084) |      | (Port 8085) |    | (Port 8086) |
|  8081)   |       |  gRPC 9090)|       |             |      |             |    |             |
+----------+       +------------+       +-------------+      +-------------+    +-------------+
    |                    |                    |                    |                  |
    |                    |                    +----------+---------+                  |
    |                    |                               | (Kafka topics:             |
    |                    |                               |  payment.events,           |
    |                    |                               |  booking.events,           |
    |                    |                               |  ticket.events)            |
    v                    v                               v                            v
MariaDB 3307         Redis 6379                     MariaDB 3307                MinIO 9000 &
(ticketnow_event)    (ticketnow:event:*)            (ticketnow_booking,         MariaDB 3307
                                                     ticketnow_payment)         (ticketnow_ticket)
```

---

## 2. Chi tiết 7 bước trong luồng dữ liệu

### Bước 1: Đăng nhập & Xác thực JWT (`/api/ticketnow/session`)
- Người dùng đăng nhập qua form hoặc tài khoản test (`customer01`, `organizer01`, `admin01` với mật khẩu tương ứng `customer123`, `organizer123`, `admin123`).
- Next.js server route gọi Keycloak Direct Grant (`POST /realms/ticketnow/protocol/openid-connect/token`).
- Token `access_token` được lưu vào HttpOnly Cookie `app-session`.
- Thư viện `frontend/src/lib/backend-api.ts` (`fetchGateway`) tự động trích xuất `app-session` và gửi header `Authorization: Bearer <token>` đến API Gateway `http://localhost:8080`.

### Bước 2: Duyệt sự kiện & Sơ đồ ghế (`/events` & `/events/[slug]`)
- Trang chủ `/` và trang `/events/[slug]` gọi hàm `getEvents()` và `getEvent(slug)` trong `frontend/src/lib/events.ts`.
- `getEvents()` gọi Gateway:
  - `GET /api/v1/events?page=0&size=50` (từ `eventservice`).
  - `GET /api/v1/venues?page=0&size=50` (từ `eventservice`).
- `getEvent(slug)` gọi:
  - `GET /api/v1/events/{id}`.
  - `GET /api/v1/events/{id}/seatmap`.
- Dữ liệu được chuẩn hóa thành `Event` frontend qua `frontend/src/lib/event-adapter.ts` (`adaptToFrontendEvent`), bao gồm đầy đủ phân khu sân khấu, hạng vé và danh sách ghế.
- Ghế đã bán hoặc đang giữ được cập nhật định kỳ mỗi 10 giây qua `GET /api/ticketnow/availability?event={id}` -> gọi `GET /api/v1/events/{id}/seats` (`seat-inventory`).

### Bước 3: Giữ chỗ & Tạo đơn hàng (`POST /api/ticketnow/bookings` với `action: 'hold'`)
- Khách hàng chọn tối đa 6 ghế trên sơ đồ và bấm tiếp tục.
- `EventDetail.tsx` gửi yêu cầu:
  ```json
  {
    "action": "hold",
    "event": "eventId",
    "seats": ["VIP-1-01", "VIP-1-02"],
    "key": "uuid-idempotency-key"
  }
  ```
- Route handler tra cứu hạng vé và đơn giá từ `seatmap`, sau đó gọi Gateway `POST /api/v1/bookings` trên `booking-service` với header `Idempotency-Key`:
  ```json
  {
    "eventId": "eventId",
    "seats": [
      { "seatId": "VIP-1-01", "tierId": "...", "price": 500000.0 },
      { "seatId": "VIP-1-02", "tierId": "...", "price": 500000.0 }
    ]
  }
  ```
- `booking-service` kiểm tra trùng lặp khóa Idempotency, lưu booking trạng thái `AWAITING_PAYMENT`, và giữ ghế đồng bộ qua `seat-inventory` (Redis lock với TTL 10 phút).
- Trả về mã đơn `{ ok: true, id: booking.id }` để chuyển hướng tới `/checkout/{booking.id}`.

### Bước 4: Xem trang thanh toán (`/checkout/[id]`)
- `frontend/src/app/(frontend)/checkout/[id]/page.tsx` ưu tiên truy vấn Gateway `GET /api/v1/bookings/{id}` (`booking-service`).
- Tự động lấy thông tin sự kiện `getEvent(backendBooking.eventId)` và định dạng lại thành đối tượng `booking` với:
  - `id`: Mã booking backend.
  - `reference`: Mã đơn dạng `TN-XXXXXXXX`.
  - `status`: `held`, `confirmed`, `cancelled`, hoặc `expired`.
  - `seats`: Danh sách ghế và giá tiền.
  - `expiresAt`: Đếm ngược thời gian giữ chỗ thời gian thực.
- Nếu Gateway tạm thời ngoại tuyến, hệ thống tự động fallback đọc từ cơ sở dữ liệu PayloadCMS local.

### Bước 5: Xác nhận thanh toán & Kích hoạt luồng sự kiện Kafka (`POST /api/ticketnow/bookings` với `action: 'pay'`)
- Khách hàng chọn phương thức thanh toán và bấm "Xác nhận thanh toán".
- Route handler thực hiện:
  1. Tạo giao dịch tại `payment-service` qua Gateway: `POST /api/v1/payments` với `bookingId` và `amount`.
  2. Kích hoạt hoàn tất thanh toán (MOCK simulation hoặc PayOS VietQR Webhook): `POST /api/v1/payments/mock/simulate-success/{orderCode}`.
  3. `payment-service` đánh dấu thanh toán `SUCCESS` và bắn sự kiện `PaymentSucceeded` lên topic Kafka `payment.events`.
  4. `booking-service` nhận sự kiện `PaymentSucceeded` -> chuyển trạng thái đơn hàng sang `CONFIRMED` -> xác nhận ghế vĩnh viễn (`CONFIRMED`) trong `seat-inventory` -> bắn sự kiện `BookingConfirmed` lên `booking.events`.
  5. `ticket-service` nhận sự kiện `PaymentSucceeded` -> phát hành vé điện tử với mã vé duy nhất `TN-XXXXXX`, sinh chữ ký số chống giả mạo HMAC-SHA256, tạo mã QR và lưu trữ lên MinIO (hoặc Data URI) -> bắn sự kiện `TicketIssued` lên `ticket.events`.
  6. Đồng thời gọi `POST /api/v1/bookings/{id}/confirm` để đảm bảo đơn hàng cập nhật tức thì.

### Bước 6: Khách hàng xem vé điện tử QR (`/customer/tickets`)
- `frontend/src/app/(frontend)/customer/tickets/page.tsx` gọi `GET /api/v1/tickets/my-tickets` trên `ticket-service` qua Gateway.
- Lấy toàn bộ danh sách vé của khách hàng (kèm `qrPayload`, `qrCodeUrl`, `seatCode`, `ticketCode`).
- Nhóm vé theo từng đơn hàng, tự động render mã QR định dạng SVG rõ nét, cho phép khách hàng xem trực tiếp hoặc tải vé QR về thiết bị.
- Đồng thời gọi `GET /api/v1/bookings/me` (`booking-service`) để hiển thị cả các đơn hàng đang chờ thanh toán.

### Bước 7: Ban tổ chức / Soát vé tại cổng (`/organizer` & `POST /api/ticketnow/scan`)
- Ban tổ chức hoặc nhân viên soát vé nhập/quét mã QR vé tại tab "Soát vé tại cổng" trên Dashboard.
- `frontend/src/app/(frontend)/api/ticketnow/scan/route.ts` chuyển tiếp yêu cầu đến Gateway `POST /api/v1/tickets/check-in`:
  ```json
  {
    "qrPayload": "TN-XXXXXX:ticketId:eventId:seatCode.signature",
    "deviceInfo": "GATE-SCANNER-WEB"
  }
  ```
- `ticket-service`:
  1. Kiểm tra tính toàn vẹn và chữ ký HMAC-SHA256 của mã QR (chống làm giả vé).
  2. Kiểm tra trạng thái vé: Nếu vé đã dùng (`USED`), trả về **HTTP 409 Conflict** ("Vé đã được sử dụng hoặc không hợp lệ. Không cho phép vào cổng lần hai.").
  3. Ghi nhận `TicketCheckIn` với thông tin người soát vé và thiết bị, chuyển trạng thái vé sang `USED`.
- Giao diện Dashboard hiển thị thông báo thành công màu xanh: `Vé hợp lệ · TN-XXXXXX · Ghế A-1-01. Đã ghi nhận vào cổng.`

---

## 3. Danh sách các file đã chỉnh sửa & cập nhật

1. `frontend/src/app/(frontend)/api/ticketnow/bookings/route.ts`:
   - Kết nối `hold` với `booking-service` (`POST /api/v1/bookings`) và tra cứu hạng vé từ `eventservice` `seatmap`.
   - Kết nối `pay` với `payment-service` (`POST /api/v1/payments` & `mock/simulate-success`) và `booking-service` (`POST /api/v1/bookings/{id}/confirm`).
   - Kết nối `cancel` với `booking-service` (`POST /api/v1/bookings/{id}/cancel`).
2. `frontend/src/app/(frontend)/checkout/[id]/page.tsx`:
   - Ưu tiên nạp booking từ `booking-service` (`GET /api/v1/bookings/{id}`) thông qua API Gateway.
   - Fallback an toàn vào PayloadCMS khi offline.
3. `frontend/src/app/(frontend)/customer/tickets/page.tsx`:
   - Ưu tiên nạp vé điện tử từ `ticket-service` (`GET /api/v1/tickets/my-tickets`) và nạp đơn hàng từ `booking-service` (`GET /api/v1/bookings/me`).
   - Tự động sinh mã QR SVG từ chữ ký chống giả của `ticket-service`.
4. `frontend/src/app/(frontend)/api/ticketnow/scan/route.ts`:
   - Kết nối trực tiếp vào `ticket-service` (`POST /api/v1/tickets/check-in`).
   - Xử lý mã lỗi chữ ký giả (400), vào cổng lần hai (409 Conflict), và fallback local.
5. `frontend/src/app/(frontend)/organizer/page.tsx`:
   - Nạp đơn hàng và sự kiện để hiển thị doanh thu và quản lý soát vé.
6. `frontend/.env.local` & `frontend/.env.example`:
   - Bổ sung cấu hình `FIGMA_CONTENT_API_URL=http://localhost:3000` để đảm bảo môi trường Next.js khởi động mượt mà.

---

## 4. Kết quả kiểm tra xác thực
- **TypeScript Type Check:** `pnpm --prefix frontend type-check` -> **0 lỗi** (`tsc --noEmit` exit 0).
- **Postman API Collection:** `python postman/validate_collection.py` -> **81 requests, bao phủ 46/46 operations** thành công 100%.
