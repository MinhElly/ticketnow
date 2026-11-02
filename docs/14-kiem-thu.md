# 14 – Kế hoạch kiểm thử

## 1. Các tầng test
| Tầng | Công cụ | Phạm vi |
| --- | --- | --- |
| Unit | JUnit 5, Mockito | Domain, state machine, Saga step |
| Integration | Testcontainers (Postgres, Redis, Kafka) | Repository, Lua script, Outbox, consumer idempotent |
| Contract | Pact / Spring Cloud Contract (tùy chọn) | booking ↔ payment/seat-inventory |
| End-to-end | RestAssured hoặc k6 functional | Luồng đặt vé trên Compose |
| Load | k6 | Benchmark 8.4, NFR-02, NFR-03 |
| Chaos | Tay (kill pod) hoặc Chaos Mesh/Litmus | Mục 3 |

## 2. Ma trận test bắt buộc [Bổ sung]
| Kiểm thử | Loại | Kết quả đạt |
| --- | --- | --- |
| 100 luồng song song hold cùng 1 ghế | Integration (cả 3 chiến lược) | Đúng 1 thành công |
| Hold all-or-nothing (3 ghế, 1 bị chiếm) | Integration | Không ghế nào bị giữ |
| Lua confirm sau hết hạn | Integration | Trả `HOLD_LOST` |
| Gửi `Idempotency-Key` 10 lần song song | Integration | 1 booking, 1 payment |
| Webhook trùng 3 lần | Integration | 1 lần trừ tiền |
| Consumer xử lý lại cùng `eventId` | Integration | Không thay đổi lần hai |
| Outbox relay 2 instance song song | Integration | Không gửi trùng ở mức nghiệp vụ |
| Quét QR cùng vé từ 2 thiết bị | Concurrency | 1 hợp lệ, 1 "đã dùng" |
| Saga tiếp tục sau restart | Integration | Hoàn tất từ bước dang dở |
| Queue: join lặp lại cùng user | Integration | Giữ vị trí cũ |
| Queue token hết hạn / sai chữ ký | Gateway test | 403 |
| Customer Agent: truy vấn booking của user khác | Guardrail test | Từ chối |
| Prompt injection trong tài liệu RAG | Guardrail test | Không thực thi chỉ thị nhúng |

## 3. Khung k6 ngày mở bán
```javascript
import http from 'k6/http';
import { check } from 'k6';

// 409 (ghế bị giữ) và 429 (rate limit) là kết quả hợp lệ
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409, 429));

export const options = {
  scenarios: {
    sale_open: {
      executor: 'ramping-arrival-rate',
      startRate: 100, timeUnit: '1s',
      preAllocatedVUs: 2000, maxVUs: 20000,
      stages: [
        { target: 3000, duration: '30s' },
        { target: 3000, duration: '60s' },
        { target: 0, duration: '15s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:hold}': ['p(95)<500'],
  },
};

export default function () {
  const base = __ENV.BASE;
  const headers = { headers: { Authorization: 'Bearer ' + __ENV.TOKEN, 'X-Queue-Token': __ENV.QTOKEN } };
  const seat = 'A-' + (1 + Math.floor(Math.random() * 40)) + '-' + (1 + Math.floor(Math.random() * 50));
  const res = http.post(base + '/api/v1/bookings',
    JSON.stringify({ eventId: __ENV.EVENT, seatIds: [seat] }),
    Object.assign({ tags: { name: 'hold' } }, headers));
  check(res, { 'status hop le': (r) => [201, 409, 429].includes(r.status) });
}
```
**Ghi chú:** cần script sinh trước nhiều user/JWT (hoặc endpoint test-only ở dev); sau mỗi lần chạy, chạy truy vấn kiểm tra bán trùng. **[Bổ sung]** Mẫu trên dùng một token chung nên rate limit theo user sẽ chặn gần hết; dùng `SharedArray` chứa danh sách token/queue token của nhiều user, chọn theo `__VU`. Cần `Idempotency-Key` UUID mỗi request. Chạy k6 từ máy khác máy chạy hệ thống nếu có thể, hoặc giới hạn CPU để không tranh tài nguyên.

## 4. Kịch bản chaos
| # | Sự cố | Kỳ vọng |
| --- | --- | --- |
| 1 | Mock payment chậm 8 s | Breaker OPEN, fallback chạy, alert bắn, Ops Agent chẩn đoán đúng |
| 2 | Mock payment chết | Như trên; hold ghế vẫn hoạt động |
| 3 | Kill 1 pod booking giữa Saga | Saga tiếp tục khi pod mới lên, không mất booking |
| 4 | Kafka dừng 2 phút | Outbox tích lại, gửi hết khi Kafka lên, không mất/trùng side-effect |
| 5 | Redis chậm/mất | seat-inventory lỗi có kiểm soát, không bán trùng, đối soát sửa lại |
| 6 | Webhook gửi 3 lần | Chỉ trừ tiền 1 lần |
| 7 | Postgres hết connection | Gateway 503, tự phục hồi khi hết tải |
| 8 | Consumer lỗi liên tục | Message vào DLT, alert bắn |

**Mẫu biên bản mỗi kịch bản [Bổ sung]:** cách gây lỗi (lệnh) → thời điểm bắt đầu → alert bắn lúc nào → tự phục hồi sau bao lâu → mất dữ liệu? → ảnh Grafana → chẩn đoán của Ops Agent.
