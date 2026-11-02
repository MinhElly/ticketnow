# 13 – Kế hoạch 8 tuần

Mỗi tuần kết thúc bằng một bản chạy được và một mục ghi vào báo cáo. Trễ tiến độ: cắt theo thứ tự ưu tiên ở file 15.

## Tổng quan
| Tuần | Chủ đề | Sản phẩm chính | Rủi ro chính |
| --- | --- | --- | --- |
| 1 | Nền móng | Compose infra, Eureka, Config, Gateway, event-service | Cấu hình Keycloak mất thời gian |
| 2 | Đặt vé đồng bộ | seat-inventory (pessimistic), booking, REST | Scope creep |
| 3 | Hold nâng cao + gRPC | 3 chiến lược, gRPC, benchmark | Số liệu benchmark không ổn định |
| 4 | Kafka, Saga, Outbox | payment, ticket, notification, Saga | Debug bất đồng bộ |
| 5 | Chịu lỗi + hàng đợi | Resilience4j, idempotency, queue, rate limit | Tương tác nhiều lớp |
| 6 | Observability | Metric, dashboard, Loki, Tempo, alert | Trace đứt ở Kafka/Outbox |
| 7 | K8s, CI/CD, load test lớn | Helm, HPA/KEDA, ArgoCD, k6 20k | Máy yếu, thiếu RAM |
| 8 | AI Agent, hoàn thiện | 2 agent, báo cáo, demo | Dồn việc cuối |

## Tuần 1: Nền móng
- [ ] Monorepo, parent POM (Spring Boot 3, Java 21), checkstyle/spotless.
- [ ] Compose profile `infra` (Postgres, Redis, Kafka, Keycloak).
- [ ] discovery-server (Eureka), config-server (Git).
- [ ] api-gateway: route, JWT Keycloak.
- [ ] event-service: CRUD, hạng vé, sinh ghế, cache seatmap.

**Xong khi:** gọi API qua Gateway với JWT; đổi cấu hình ở Config Server, service nhận được. **Báo cáo:** Service Discovery, Config, Gateway.

## Tuần 2: Luồng đặt vé đồng bộ (bản đơn giản)
- [ ] seat-inventory với chiến lược Pessimistic trước.
- [ ] booking: tạo booking, gọi seat-inventory bằng REST (OpenFeign), trạng thái cơ bản.
- [ ] Flyway cho mọi service; OpenAPI + Swagger UI.
- [ ] Unit + integration test (Testcontainers).

**Xong khi:** đặt được 1 booking, không bán trùng trong test đơn giản. **Báo cáo:** Interservice Communication (REST). **[Bổ sung]** Đưa `bookingId` + `traceId` vào log ngay tuần này.

## Tuần 3: Hold nâng cao và gRPC
- [ ] Optimistic và Redis Lua sau `SeatLockStrategy`.
- [ ] booking → seat-inventory chuyển gRPC (deadline 500 ms).
- [ ] Hold TTL 10 phút, `hold_expiry`, job `HoldExpired`, job đối soát.
- [ ] k6 S1-S4, chạy benchmark, điền bảng.

**Xong khi:** có bảng số liệu so sánh 3 chiến lược. **Báo cáo:** "Chống bán trùng" (kèm REST vs gRPC).

## Tuần 4: Kafka, Saga, Outbox
- [ ] Topic, envelope, Outbox relay, `processed_events`.
- [ ] payment-service + mock gateway; webhook HMAC.
- [ ] Saga orchestration (`saga_state`, compensation).
- [ ] ticket-service (QR, MinIO), notification-service (MailHog).
- [ ] DLT.

**Xong khi:** happy path và các luồng lỗi mục 5.3 chạy đúng; kill consumer giữa chừng không mất event. **Báo cáo:** Messaging, Saga, Outbox.

## Tuần 5: Chịu lỗi và hàng đợi
- [ ] Resilience4j payment + fallback.
- [ ] Idempotency-Key booking/payment; test gửi trùng 10 lần.
- [ ] queue-service: ZSET, SSE, admit scheduler, queue token JWT; `QueueTokenFilter`.
- [ ] Rate limit Redis, load shedding 429/503.

**Xong khi:** bật "payment chết", hệ thống vẫn giữ ghế/xem sự kiện; breaker OPEN → HALF_OPEN → CLOSED. **Báo cáo:** Circuit Breaker, Idempotency, Waiting Room.

## Tuần 6: Observability
- [ ] Actuator + Micrometer, metric tùy chỉnh.
- [ ] Prometheus, Grafana (Sale Day, RED, Kafka/Saga, Resilience), Alertmanager.
- [ ] Loki (log JSON), Tempo (trace), liên kết log ↔ trace.
- [ ] Trace Gateway → booking → gRPC → Kafka → payment → ticket.

**Xong khi:** alert → dashboard → trace → log. **Báo cáo:** Tracing, Observability kèm ảnh.

## Tuần 7: Kubernetes, CI/CD, load test lớn
- [ ] kind/minikube; Helm chart chung; ConfigMap/Secret thay Config Server; K8s DNS thay Eureka.
- [ ] HPA (CPU), KEDA (Kafka lag); probe; PDB; graceful shutdown.
- [ ] GitHub Actions + GHCR + ArgoCD.
- [ ] k6 20.000 VU, quay Grafana, kill pod giữa tải.

**Xong khi:** đạt NFR (file 01) hoặc giải thích rõ vì sao chưa. **Báo cáo:** Triển khai, load test, so sánh monolith vs microservice (nếu có).

## Tuần 8: AI Agent, hoàn thiện, bảo vệ
- [ ] Customer Agent: tool calling + RAG + xác nhận hoàn vé.
- [ ] Ops Agent: alert → Prometheus/Loki/Tempo → báo cáo có cấu trúc.
- [ ] Metric/trace LLM; timeout + breaker.
- [ ] Báo cáo, slide, video demo dự phòng, tập demo.

**Xong khi:** demo trọn vẹn chạy hai lần liên tiếp không lỗi.

> Nếu chỉ có 6 tuần: gộp tuần 1-2; AI Agent chỉ làm Customer Agent bản đơn giản (RAG + 3 tool đọc).

## Lịch rút gọn 6 tuần [Bổ sung]
| Tuần | Nội dung |
| --- | --- |
| 1 | Tuần 1+2 gộp |
| 2 | Tuần 3 |
| 3 | Tuần 4 |
| 4 | Tuần 5 + observability tối thiểu (Prometheus, Grafana, tracing) |
| 5 | K8s + HPA + load test |
| 6 | Customer Agent đơn giản + báo cáo + demo |
