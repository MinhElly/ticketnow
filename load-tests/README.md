# Load tests – TicketNow (Tuần 3)

Bộ kịch bản k6 để đo 3 chiến lược khóa ghế (`pessimistic`, `optimistic`, `redis`)
và so sánh độ trễ REST với gRPC. Kết quả dùng cho bảng số liệu trong báo cáo
"Chống bán trùng" và phần bảo vệ luận văn.

## 1. Kịch bản

| File | Kịch bản | Mặc định | Kỳ vọng |
| --- | --- | --- | --- |
| `scenarios/s1-contention.js` | S1 – 1.000 VU tranh 100 ghế | 1000 VU / 100 ghế | 100 thành công, 900 conflict, 0 ghế trùng |
| `scenarios/s2-scale.js` | S2 – 20.000 VU tranh 2.000 ghế | 20000 VU / 2000 ghế | 2000 thành công, 18000 conflict, 0 ghế trùng |
| `scenarios/s3-hot-seat.js` | S3 – mọi VU giữ 1 ghế | 1000 VU / 1 ghế | đúng 1 thành công, còn lại 409 |
| `scenarios/s4-distributed.js` | S4 – mỗi VU một ghế khác nhau | 1000 VU / 1000 ghế | gần như 100% thành công |
| `grpc/hold-seats.js` | REST vs gRPC – cùng S1 qua gRPC | 1000 VU / 100 ghế | so sánh p50/p95/p99 với S1 REST |

Mỗi request dùng `bookingId` duy nhất (`VU` + iteration + timestamp), nên không
dính idempotency của booking-service. Các script gọi **trực tiếp seat-inventory**
(port 8083 / 9083) để đo đúng tầng khóa ghế, không tính overhead Gateway.

## 2. Chuẩn bị

### 2.1. Công cụ

- k6 >= 0.49 (đã có module `k6/net/grpc`).
- Docker Desktop đang chạy (MariaDB `ticketnow-mariadb`, Redis `ticketnow-redis`).
- `seat-inventory` chạy ở port 8083 + gRPC 9083.
- Access token của `customer01` hoặc `organizer01` lấy qua Postman PKCE
  (xem `postman/README.md`). Không commit token vào Git.

```powershell
# PowerShell
$env:TOKEN = '<access token vừa copy từ Postman>'
$env:DB_ROOT_PASSWORD = '<DB_ROOT_PASSWORD trong deploy/compose/.env>'
```

### 2.2. Seed ghế

Một event benchmark dùng chung cho S1–S4, seed 20.000 ghế (chia batch 1.000 ghế
theo đúng khuyến nghị trong `docs/03-thiet-ke-service.md`):

```powershell
.\load-tests\scripts\seed-seats.ps1 -EventId bench-event -Seats 20000
```

Lệnh này gọi `POST /api/v1/events/bench-event/seats/initialize` với token
organizer. API initialize là idempotent theo `(event_id, seat_id)`, chạy lại
không nhân đôi ghế.

### 2.3. Reset dữ liệu giữa các lần chạy

Hold mặc định TTL 600 giây, nhưng benchmark cần trạng thái sạch ngay lập tức.
Script reset đưa toàn bộ ghế của event về `AVAILABLE` và xóa Redis key
`seat:{eventId}:*` (dùng Lua/scan an toàn, không FLUSHDB):

```powershell
.\load-tests\scripts\reset-seats.ps1 -EventId bench-event
```

Script yêu cầu `DB_ROOT_PASSWORD` (hoặc truyền `-DbPassword`). Nếu dùng
`run-benchmark.ps1`, việc reset được thực hiện tự động trước mỗi kịch bản.

## 3. Chạy benchmark 3 chiến lược

`seat.lock.strategy` đọc từ biến môi trường `SEAT_LOCK_STRATEGY` lúc khởi động.
Service **phải được restart** sau khi đổi chiến lược.

```powershell
# Ví dụ Pessimistic
$env:SEAT_LOCK_STRATEGY = "pessimistic"
mvn -f seat-inventory/pom.xml spring-boot:run
```

Terminal khác, chạy S1–S4 (tự seed nếu thêm `-Seed`):

```powershell
.\load-tests\scripts\run-benchmark.ps1 -Strategy pessimistic -Seed
```

Sau đó restart với `optimistic`, rồi `redis`, và chạy lại:

```powershell
.\load-tests\scripts\run-benchmark.ps1 -Strategy optimistic
.\load-tests\scripts\run-benchmark.ps1 -Strategy redis
```

Kết quả summary JSON lưu ở `load-tests/results/<strategy>-<scenario>-<timestamp>.json`.
Chạy mỗi cấu hình **3 lần**, lấy trung vị; ghi cấu hình CPU/RAM máy và container
vào báo cáo. Giữ cố định số VU/ghế giữa 3 chiến lược.

Chạy nhanh một kịch bản để kiểm tra:

```powershell
k6 run -e VUS=20 -e SEATS=10 load-tests/scenarios/s1-contention.js
```

### Đọc kết quả

- `holds_success`: số hold thành công; `holds_conflict`: số 409; `holds_unexpected`:
  lỗi khác (401/5xx…) – phải bằng 0 khi cấu hình đúng.
- `hold_latency`: p50/p95/p99 của request hold (ms).
- `http_req_duration`: latency HTTP tổng; `http_req_failed` sẽ tính 409 là failed,
  nên **không dùng** chỉ số này để kết luận benchmark (409 là kết quả hợp lệ).
- Sau mỗi lần chạy, kiểm tra bán trùng:

```powershell
Get-Content -Raw load-tests/sql/check-duplicates.sql |
  docker exec -i ticketnow-mariadb mariadb -uroot -p"$env:DB_ROOT_PASSWORD"
```

`check-duplicates.sql` phải trả `0` dòng cho truy vấn ghế CONFIRMED trùng và
`0` cho ghế HELD quá hạn.

## 4. So sánh REST vs gRPC

gRPC chỉ chạy khi `seat-inventory` bật server 9083 (mặc định bật). Script gRPC
gọi đúng cùng S1 (1000 VU / 100 ghế) qua `ticketnow.seat.v1.SeatInventory/HoldSeats`:

```powershell
# Script tự resolve proto tại ../../contracts/proto (tương đối với load-tests/grpc)
k6 run -e VUS=1000 -e SEATS=100 -e EVENT_ID=bench-event load-tests/grpc/hold-seats.js
# Nếu chạy từ vị trí khác, truyền đường dẫn tuyệt đối:
# k6 run -e PROTO_DIR=C:\Code\ticketnow\contracts\proto load-tests/grpc/hold-seats.js
```

So sánh với S1 REST trên cùng event, sau khi reset:

```powershell
.\load-tests\scripts\reset-seats.ps1 -EventId bench-event
k6 run -e VUS=1000 -e SEATS=100 -e EVENT_ID=bench-event load-tests/scenarios/s1-contention.js
```

Ghi bảng:

| Transport | Throughput (req/s) | p50 | p95 | p99 | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| REST (JWT + Spring MVC) | | | | | |
| gRPC (deadline 500 ms) | | | | | |

**Lưu ý công bằng khi kết luận:** REST đi qua Spring Security/JWT và JSON; gRPC
server hiện là internal endpoint chưa bật xác thực JWT (metadata `authorization`
được booking-service lan truyền để sẵn sàng cho bước hardening sau). Vì vậy chênh
lệch phản ánh cả transport lẫn chi phí xác thực. Nêu rõ điều này trong báo cáo,
hoặc bổ sung JWT interceptor cho gRPC trước khi so sánh tuyệt đối.

## 5. Mẫu bảng kết quả (điền sau khi chạy)

Mỗi ô chạy 3 lần, lấy trung vị. Ghi CPU/RAM máy, phiên bản MariaDB/Redis, số
connection pool.

| Chiến lược | Kịch bản | Throughput (req/s) | p50 | p95 | p99 | Ghế trùng | CPU DB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pessimistic | S1 | | | | | 0 | |
| Pessimistic | S2 | | | | | 0 | |
| Pessimistic | S3 | | | | | 0 | |
| Pessimistic | S4 | | | | | 0 | |
| Optimistic | S1–S4 | | | | | 0 | |
| Redis Lua | S1–S4 | | | | | 0 | |

## 6. Ghi chú kỹ thuật

- Benchmark gọi thẳng seat-inventory; nếu muốn đo qua Gateway/booking-service,
  đổi `BASE_URL` và bổ sung header `Idempotency-Key` (xem `docs/14-kiem-thu.md`).
- Với S2 20.000 VU, cần máy đủ RAM/CPU; có thể giảm `VUS`/`SEATS` theo cùng tỉ lệ
  10:1 để smoke test, nhưng bảng báo cáo phải ghi rõ cấu hình thực tế.
- Redis Lua tự hết hạn key theo TTL; worker `HoldExpired` quét DB mỗi 30 giây
  (`seat.hold-expiry.sweep-interval-ms`). Reset script vẫn cần thiết để chạy lại
  benchmark ngay, không chờ TTL.
- Không chạy benchmark trên môi trường có dữ liệu thật; dùng event `bench-event`
  riêng và DB local.
