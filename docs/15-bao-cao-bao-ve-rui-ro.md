# 15 – Báo cáo, bảo vệ, rủi ro, Definition of Done

## 1. Dàn ý báo cáo
1. Mở đầu: bài toán, mục tiêu, phạm vi, vì sao cần microservice.
2. Cơ sở lý thuyết: microservice, CAP/consistency, Saga, Outbox, Circuit Breaker, Observability (ngắn, chỉ cái dùng thật).
3. Phân tích yêu cầu: use case, FR/NFR (file 01).
4. Thiết kế: kiến trúc, service, dữ liệu, event, luồng (file 02-06).
5. Cài đặt từng chủ đề: Discovery, Config, Gateway, giao tiếp (REST vs gRPC), Messaging/Saga/Outbox, Resilience, Waiting Room, Tracing.
6. Chống bán trùng: 3 chiến lược + benchmark (file 07).
7. Triển khai: Docker, K8s, Helm, KEDA, CI/CD, GitOps (file 10).
8. Observability: dashboard, alert, truy vết một sự cố (file 09).
9. AI Agent: thiết kế, guardrail, đánh giá trên 8 kịch bản chaos (file 11).
10. Kiểm thử và đánh giá: k6, chaos, so sánh NFR (file 14).
11. Kết luận: đạt được gì, hạn chế, hướng phát triển.
12. Phụ lục: sơ đồ, OpenAPI, ADR, hướng dẫn chạy.

## 2. Kịch bản demo (~12 phút)
| Phút | Nội dung |
| --- | --- |
| 0-1 | Bài toán và con số: 50.000 người, 2.000 vé |
| 1-3 | Sơ đồ kiến trúc, lý do tách service |
| 3-6 | Demo thật: hàng đợi → giữ ghế → thanh toán → vé QR → email |
| 6-9 | k6 20.000 VU, dashboard Sale Day; scale pod tự động; bảng benchmark 3 chiến lược |
| 9-11 | "Payment chết": breaker OPEN, alert, Ops Agent chẩn đoán; mở trace và log |
| 11-12 | Customer Agent hoàn vé (có xác nhận), tổng kết |

**Chuẩn bị:** video demo dự phòng, dữ liệu seed, `make demo-reset`, tài khoản test. **[Bổ sung]** Chạy thử toàn bộ ≥ 2 lần ở đúng máy dùng bảo vệ; chuẩn bị bản "đã ghi sẵn" cho phần k6 20.000 VU nếu máy không đủ tải.

## 3. Câu hỏi hội đồng thường hỏi
| Câu hỏi | Hướng trả lời |
| --- | --- |
| Vì sao không monolith? | Số liệu scale độc lập (file 02) |
| Vì sao orchestration thay vì choreography? | Dễ theo dõi/debug; orchestrator là điểm tập trung nhưng stateless + `saga_state` |
| Redis mất dữ liệu thì sao? | Redis chỉ là lớp quyết định tốc độ; Postgres bền; job đối soát; `tickets UNIQUE` là chốt chặn |
| Exactly-once có đạt không? | At-least-once + idempotent consumer, giải thích rõ |
| Vì sao cả gRPC và REST? | Đo thực tế latency/tải mạng, nêu kết quả |
| AI Agent an toàn thế nào? | Guardrail, xác nhận người dùng, tool chỉ đọc cho Ops |
| **[Bổ sung]** Vì sao dùng Redis Lua thay vì distributed lock? | Một script nguyên tử, ít round trip, không có vấn đề hết hạn khóa |
| **[Bổ sung]** Điều gì xảy ra nếu thanh toán thành công sau khi hold hết hạn? | Tự hoàn tiền (Saga bù trừ), có test |
| **[Bổ sung]** Queue có công bằng không? | FIFO theo `INCR`; một user một vị trí; nêu hạn chế bot |

## 4. Rủi ro và cách giảm
| Rủi ro | Cách giảm |
| --- | --- |
| Máy không đủ RAM (Kafka, Postgres, Grafana, K8s) | Compose theo profile; một Postgres nhiều DB; Kafka KRaft 1 node; dùng LLM qua API thay Ollama |
| Làm quá nhiều, không kịp | Theo thứ tự ưu tiên bên dưới; chỉ làm kỹ chủ đề có số liệu |
| Sa vào hạ tầng, quên nghiệp vụ | Luôn có luồng đặt vé chạy được trước, rồi thêm lớp |
| Frontend ngốn thời gian | Một trang tối giản hoặc Swagger UI + k6; đồ án chấm backend |
| Debug Saga/Kafka khó | Trace và `bookingId` trong mọi log từ tuần 2-4 |
| Benchmark không ổn định | Cố định tài nguyên, chạy 3 lần lấy trung vị, ghi cấu hình máy |

**Thứ tự ưu tiên (cắt từ dưới lên):**
1. **Bắt buộc:** event, booking, seat-inventory, payment, Gateway, Eureka/Config, Kafka + Saga + Outbox, Resilience4j, Prometheus/Grafana, Tracing.
2. **Rất nên có:** queue-service, benchmark 3 chiến lược, K8s + HPA, Customer Agent.
3. **Nên có:** KEDA, ArgoCD, Ops Agent, ticket QR.
4. **Tùy chọn:** MCP, Fraud Agent, Debezium, contract test, monolith đối chứng.

## 5. Definition of Done
- [ ] Chạy toàn bộ bằng một lệnh Compose và một lệnh Helm/ArgoCD.
- [ ] README: sơ đồ kiến trúc, cách chạy, tài khoản test, đường dẫn Swagger/Grafana.
- [ ] Happy path và 8 luồng lỗi (file 04) có test tự động.
- [ ] Bảng benchmark 3 chiến lược và kết quả k6 20.000 VU có trong báo cáo.
- [ ] Mỗi booking truy vết được bằng một traceId, nối sang log.
- [ ] Dashboard Sale Day và ≥ 5 alert rule hoạt động.
- [ ] 2 AI Agent demo được; có bảng đánh giá trên kịch bản chaos.
- [ ] ADR cho các quyết định lớn; video demo dự phòng.

## 6. Từ khóa tra cứu
Saga pattern (orchestration vs choreography), Transactional Outbox, Idempotent Consumer, Dead Letter Topic, Circuit Breaker / Bulkhead / Retry, Virtual Waiting Room, Redis Lua atomic script, Optimistic vs Pessimistic locking, gRPC deadline, Spring Cloud Gateway RequestRateLimiter, Micrometer Tracing + OpenTelemetry, Grafana trace-to-logs, KEDA Kafka scaler, ArgoCD app-of-apps, Spring AI tool calling / RAG / MCP, human-in-the-loop, prompt injection.
