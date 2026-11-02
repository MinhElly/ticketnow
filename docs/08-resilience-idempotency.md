# 08 – Chịu lỗi, rate limit, idempotency

## 1. Resilience4j cho cổng thanh toán
```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentGateway:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 20
        minimumNumberOfCalls: 10
        failureRateThreshold: 50
        slowCallDurationThreshold: 2s
        slowCallRateThreshold: 60
        waitDurationInOpenState: 15s
        permittedNumberOfCallsInHalfOpenState: 3
        automaticTransitionFromOpenToHalfOpenEnabled: true
  timelimiter:
    instances:
      paymentGateway:
        timeoutDuration: 3s
  bulkhead:
    instances:
      paymentGateway:
        maxConcurrentCalls: 50
        maxWaitDuration: 0
  retry:
    instances:
      paymentGateway:
        maxAttempts: 3
        waitDuration: 300ms
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
```
Thứ tự bọc: `Retry( CircuitBreaker( TimeLimiter( Bulkhead( call ))))`. Chỉ retry khi lời gọi idempotent (luôn gửi idempotency key cho cổng).

**Trạng thái breaker:** CLOSED → (lỗi/chậm vượt ngưỡng) OPEN 15 s → HALF_OPEN (3 lời gọi thử) → CLOSED hoặc OPEN lại.

**Fallback:** ghi payment `PENDING_GATEWAY`, phát `PaymentDelayed`, trả 202 "đang xử lý". Job nền retry các payment `PENDING_GATEWAY` khi breaker đóng lại. **[Bổ sung]** Nếu hold sắp hết hạn trong lúc payment đang chờ, có thể gia hạn hold một lần (extend TTL) để khách không mất ghế do lỗi hệ thống; cần RPC `ExtendHold`.

## 2. Bảng timeout (tầng trong < tầng ngoài)
| Lời gọi | Timeout |
| --- | --- |
| Client → Gateway | 10 s |
| Gateway → service | 5 s |
| booking → seat-inventory (gRPC deadline) | 500 ms |
| payment → cổng mock | 3 s |
| Redis | 100 ms |
| ai-agent → LLM | 20 s |

Chuỗi hợp lệ: 100 ms (Redis) < 500 ms (gRPC) < 3 s (cổng) < 5 s < 10 s. Retry của tầng trong không được làm tổng vượt timeout của tầng ngoài (3 lần × 3 s > 5 s ở Gateway, nên retry payment chạy ở luồng nền, không nằm trên request đồng bộ của khách).

## 3. Rate limit và load shedding
```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: booking
          uri: lb://booking-service
          predicates:
            - Path=/api/bookings/**
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 5
                redis-rate-limiter.burstCapacity: 10
                key-resolver: '#{@userKeyResolver}'
            - QueueTokenFilter
```
- Rate limit theo user (`userKeyResolver`), trả 429 + `Retry-After`.
- **Load shedding:** filter đếm in-flight; vượt ngưỡng thì trả `503` + `Retry-After` thay vì để hàng đợi nội bộ phình ra rồi timeout dây chuyền.
- **[Bổ sung]** Ba lớp bảo vệ theo thứ tự: waiting room (kiểm soát đầu vào) → rate limit (theo user/IP) → load shedding (theo tải thực). Rate limiter Redis phải có timeout ngắn và fail-open hoặc fail-closed có chủ đích (khuyến nghị fail-open cho đọc, fail-closed cho giữ ghế).
- Rate limiter ở route công khai (xem sự kiện) cần ngưỡng khác với route đặt vé.

## 4. Idempotency
1. Client sinh `Idempotency-Key` (UUID) cho mỗi thao tác tạo booking/thanh toán.
2. Server insert khóa vào bảng có UNIQUE; trạng thái `IN_PROGRESS`.
3. Khóa đã tồn tại: trả response đã lưu, hoặc `409` nếu đang xử lý.
4. Hoàn tất: lưu response, đánh dấu `DONE`; dọn sau 24 giờ.

**[Bổ sung] Quy tắc chi tiết**
- Cùng key + cùng nội dung → trả lại response cũ (cùng mã HTTP). Cùng key + nội dung khác (`request_hash` lệch) → `422`.
- `IN_PROGRESS` quá lâu (> 60 s, crash giữa chừng) → cho phép tiếp quản bằng `UPDATE ... WHERE status='IN_PROGRESS' AND created_at < now()-interval '60 s'`.
- Webhook: chống trùng bằng `webhook_log.gateway_event_id` (PK).
- Gọi cổng thanh toán: dùng `payments.idempotency_key` làm khóa idempotency gửi cổng.
- Test NFR-05: gửi 10 request song song cùng key → đúng 1 `payments` và tổng tiền trừ = 1 lần.

## 5. Bulkhead và cô lập tài nguyên
- Mỗi downstream có bulkhead/thread pool/connection pool riêng (payment, seat-inventory, LLM).
- Với virtual threads, dùng Semaphore Bulkhead (không dùng thread-pool bulkhead).
- LLM có circuit breaker riêng để lỗi AI không ảnh hưởng đặt vé.
