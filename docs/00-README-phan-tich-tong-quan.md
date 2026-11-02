# TicketNow – Bộ tài liệu đồ án (bản tách chuyên đề)

Bộ này được tách từ tài liệu gốc "TicketNow: Tài liệu đồ án Microservice" (19 mục) thành 15 tài liệu chuyên đề. Quy ước: nội dung lấy từ tài liệu gốc giữ nguyên ý; phần **[Bổ sung]** là đề xuất làm rõ/mở rộng của người phân tích.

## 1. Bản đồ tài liệu

| File | Nội dung | Mục gốc |
| --- | --- | --- |
| 01-yeu-cau-va-pham-vi | Bài toán, actor, phạm vi, FR/NFR, truy vết yêu cầu | 1 |
| 02-kien-truc-va-cong-nghe | Kiến trúc, nguyên tắc, lý do microservice, stack | 2, 3 |
| 03-thiet-ke-service | API, trách nhiệm, event của 8 service + hạ tầng | 4 |
| 04-luong-nghiep-vu-saga | Luồng queue, Saga, luồng lỗi, hết hạn giữ ghế | 5 |
| 05-event-kafka-outbox | Envelope, topic, Outbox, consumer, DLT | 6, 9.4, 9.5 |
| 06-thiet-ke-du-lieu | Schema Postgres, key Redis, ERD logic | 7 |
| 07-chong-ban-trung-ghe | 3 chiến lược khóa + kế hoạch benchmark | 8 |
| 08-resilience-idempotency | Resilience4j, timeout, rate limit, idempotency | 9.1-9.3 |
| 09-observability | Metric, dashboard, alert, log, trace | 10 |
| 10-kubernetes-cicd | Cluster, autoscaling, Helm/GitOps, pipeline, Compose→K8s | 11, 13.4 |
| 11-ai-agent | Customer Agent, Ops Agent, MCP, guardrail, chi phí | 12 |
| 12-repo-va-quy-uoc | Monorepo, package, quy ước | 13 |
| 13-ke-hoach-8-tuan | Kế hoạch theo tuần + checklist | 14 |
| 14-kiem-thu | Tầng test, k6, chaos | 15 |
| 15-bao-cao-bao-ve-rui-ro | Dàn ý, demo, Q&A, rủi ro, DoD | 16-19 |

## 2. Phân tích tổng quan

**Bản chất đồ án:** hệ thống bán vé chịu tải đột biến (flash sale). Giá trị học thuật nằm ở 5 trục: (1) tính đúng đắn dưới tranh chấp (không bán trùng), (2) nhất quán phân tán (Saga, Outbox, idempotency), (3) chịu lỗi (circuit breaker, load shedding, waiting room), (4) vận hành (observability, K8s, GitOps), (5) AI Agent trong vận hành và chăm sóc khách hàng.

**Điểm mạnh của tài liệu gốc**
- NFR có con số đo được (p95, 20.000 VU, 0 ghế trùng) và gắn với k6.
- Có thứ tự ưu tiên cắt giảm, kế hoạch tuần, Definition of Done, kịch bản chaos dùng chung cho Ops Agent.
- So sánh 3 chiến lược khóa là phần "ăn điểm" rõ ràng, có kế hoạch benchmark.
- Guardrail AI (userId từ JWT, human-in-the-loop, tool chỉ đọc) đúng hướng.

**Số lượng thành phần:** 8 service nghiệp vụ + 4 hạ tầng ứng dụng (discovery, config, gateway, mock-payment), 7 topic Kafka chính, ~10 bảng chính, 13 metric tùy chỉnh, 8 kịch bản chaos, 8 tuần.

## 3. Điểm chưa nhất quán / cần quyết định sớm

| # | Vấn đề | Chi tiết | Đề xuất [Bổ sung] |
| --- | --- | --- | --- |
| 1 | Ai kích hoạt thanh toán? | Mục 5.2 vẽ client gọi `POST /payments`; mục 6.2 lại có `PaymentRequested` do booking phát trên `payment.commands`. | Chọn một: client gọi booking → booking phát `PaymentRequested` (khuyến nghị, Saga kiểm soát trọn vẹn). `POST /api/payments` chỉ còn là API nội bộ/ban đầu ở tuần 2. |
| 2 | Ai phát hành vé? | 4.6: ticket phát hành khi `PaymentSucceeded`; 5.2: booking gửi command `IssueTicket`. | Dùng command `IssueTicket` (orchestration nhất quán). Ticket không consume `PaymentSucceeded`. Sửa cột consumer của `booking.events` cho khớp. |
| 3 | Mục tiêu độ trễ giữ ghế | NFR-02 p95 < 200 ms; k6 threshold `< 500`; alert > 0.5 s. | Đồng bộ: NFR 200 ms ở 1.000 req/s; threshold k6 cho kịch bản 20k VU nới 500 ms, ghi rõ hai mốc khác nhau. |
| 4 | Quy mô tải | NFR-03 nói 20.000 VU, k6 mẫu dùng arrival rate 3.000/s (maxVUs 20.000). | Ghi rõ "20.000 VU" nghĩa là maxVUs; báo cáo nêu cả req/s thực đạt. |
| 5 | Mô hình trạng thái ghế | 7.2 dùng key có giá trị `AVAILABLE`; 8.3 đổi sang "key không tồn tại = trống". Tài liệu đã ghi nhận. | Dùng quy ước 8.3 làm chuẩn; bỏ giá trị `AVAILABLE` khỏi Redis. |
| 6 | Tính nguyên tử của ZSet | Lua script chỉ SET key; ghi `hold_expiry` ở bước sau → có thể lệch nếu crash. | Đưa `ZADD hold_expiry` vào cùng script Lua (cùng slot nhờ hash tag). Xem file 07. |
| 7 | Event chưa định nghĩa | `HoldExpiringSoon` (notification consume) và `QueueAdmitted` không có trong bảng topic. | Thêm `queue.events` và phát `HoldExpiringSoon` từ job quét `hold_expiry`. Xem file 05. |
| 8 | Confirm sau khi hết hạn | Thanh toán tới trễ, key Redis đã hết TTL, ghế có thể bị người khác giữ. | `ConfirmSeats` phải kiểm `HELD:{bookingId}` còn đúng chủ; nếu không → hoàn tiền (đã nêu ở 5.3). Xem file 04, 07. |
| 9 | Lưu response idempotency | Bảng `bookings` có UNIQUE(user_id, idempotency_key) nhưng chưa có nơi lưu response/trạng thái `IN_PROGRESS`. | Thêm bảng `idempotency_keys`. Xem file 06, 08. |
| 10 | Bảo mật liên service | Chỉ nêu JWT ở Gateway; gRPC/Kafka nội bộ chưa nói. | Mạng nội bộ + NetworkPolicy; JWT propagation hoặc mTLS (tùy chọn). Xem file 10. |
| 11 | Tạo sự kiện → khởi tạo ghế | event-service gọi gRPC seat-inventory khởi tạo mọi ghế, nhưng seat-inventory chưa có RPC này trong `.proto`. | Thêm `InitializeSeats` (bulk, batch 1.000 ghế). Xem file 03. |

## 4. Thứ tự đọc đề xuất
Người mới: 01 → 02 → 04 → 03. Người cài đặt: 03 → 05 → 06 → 07 → 08. Người vận hành/triển khai: 09 → 10. Người viết báo cáo: 13 → 14 → 15.
