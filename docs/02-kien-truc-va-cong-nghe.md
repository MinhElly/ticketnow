# 02 – Kiến trúc tổng thể và công nghệ

## 1. Sơ đồ logic
```
                    +-----------------+
   Browser/App ---> |  API Gateway    |  JWT, rate limit, queue-token check, CORS
                    | (Spring Cloud)  |
                    +--------+--------+
                             |
   +----------+----------+---+-------+-----------+-----------+
 event-    queue-     booking-    ticket-    notification-  ai-agent-
 service   service    service     service    service        service
   |          |       (Saga          |            ^              | tool calls (MCP/REST)
   |          |     orchestrator)    |            |              v
   |          |          | gRPC      | Kafka      |        service + Prometheus/Loki/Tempo
   |          |          v           |            |
   |          |   seat-inventory     |            |
   |          |          +--- Kafka (events) -----+
   |          |                  payment-service --> Mock Payment Gateway
 Postgres (mỗi service 1 schema/DB), Redis, Kafka, MinIO, pgvector

 Hạ tầng chung: Eureka (giai đoạn 1) → K8s DNS; Config Server → ConfigMap;
 Keycloak, Prometheus, Grafana, Loki, Tempo, Alertmanager, ArgoCD
```

## 2. Nguyên tắc thiết kế
1. **Database per service:** không đọc DB của service khác.
2. **Đường nóng đồng bộ, phần còn lại bất đồng bộ:** giữ ghế qua gRPC (cần phản hồi ngay); thanh toán/vé/thông báo qua Kafka.
3. **Saga orchestration:** `booking-service` điều phối, lưu trạng thái ở `saga_state`.
4. **Consumer idempotent:** bảng `processed_events`.
5. **Mọi lệnh ghi Kafka qua Outbox:** không lệch DB và event.
6. **Fail fast, degrade gracefully:** timeout ngắn, circuit breaker, bulkhead riêng từng downstream.

## 3. Vì sao microservice (dùng khi bảo vệ)
| Thành phần | Đặc tính tải | Hệ quả thiết kế |
| --- | --- | --- |
| queue-service, seat-inventory | Cực cao, ngắn hạn | Scale ngang độc lập bằng HPA/KEDA |
| payment-service | Phụ thuộc bên thứ ba, hay chậm/lỗi | Cô lập lỗi: circuit breaker + bulkhead |
| notification, ticket | Không realtime | Bất đồng bộ qua Kafka, không chặn luồng chính |
| event-service | Đọc nhiều, ghi ít | Cache mạnh, scale hướng đọc |

Monolith buộc phải scale cả khối khi chỉ phần giữ ghế quá tải, và lỗi thanh toán có thể kéo sập toàn hệ thống.

**[Bổ sung] Cách chứng minh bằng số liệu:** dựng bản monolith đối chứng (tùy chọn) hoặc chạy benchmark scale riêng seat-inventory từ 1→4 replica trong khi các service khác cố định; ghi throughput theo số replica.

## 4. Phân loại giao tiếp
| Cặp | Kiểu | Lý do |
| --- | --- | --- |
| Client → Gateway → service | REST/HTTP | Chuẩn ngoài |
| event → seat-inventory | gRPC | Khởi tạo ghế hàng loạt |
| booking → seat-inventory | gRPC (deadline 500 ms) | Đường nóng, cần phản hồi ngay |
| booking ↔ payment/ticket | Kafka (command/event) | Bất đồng bộ, chịu lỗi |
| payment → cổng mock | HTTP + Resilience4j | Bên thứ ba |
| queue → client | SSE | Đẩy vị trí/ETA |
| ai-agent → service | REST/MCP | Tool call |

## 5. Công nghệ
| Nhóm | Công nghệ |
| --- | --- |
| Ngôn ngữ/Framework | Java 21 (virtual threads cho service IO-bound), Spring Boot 3.3+, Spring Cloud 2023.x |
| Discovery | Eureka (Compose) → Kubernetes Service DNS |
| Config | Spring Cloud Config (Git) → ConfigMap/Secret |
| Gateway | Spring Cloud Gateway + Redis RateLimiter |
| Đồng bộ | OpenFeign/RestClient, gRPC (grpc-spring-boot-starter hoặc net.devh) |
| Messaging | Kafka (KRaft), Schema Registry (tùy chọn), Spring Kafka |
| Resilience | Resilience4j: CircuitBreaker, Retry, TimeLimiter, Bulkhead, RateLimiter |
| DB | PostgreSQL 16, Redis 7, MongoDB (notification, tùy chọn), pgvector |
| Migration | Flyway |
| Bảo mật | Keycloak (OIDC, JWT) |
| Tracing | Micrometer Tracing + OpenTelemetry, Tempo |
| Metrics / Logs | Micrometer + Prometheus + Grafana / Logback JSON + Loki (Promtail hoặc Alloy) |
| Alert | Alertmanager |
| Triển khai | Docker, Kubernetes (kind/minikube), Helm, KEDA |
| CI/CD | GitHub Actions, GHCR, ArgoCD |
| Test | JUnit 5, Testcontainers, WireMock, k6, Pact (tùy chọn) |
| AI | Spring AI (hoặc LangChain4j), Ollama/OpenAI/Anthropic, pgvector, MCP |
| Frontend | React/Vite hoặc Thymeleaf; có thể chỉ Swagger UI + k6 |

**Lưu ý virtual threads:** phù hợp booking/payment/ticket/notification (IO-bound). Với service dùng Redis/Lua nóng, đo trước khi bật để tránh pinning khi dùng `synchronized`.

## 6. Cổng và định danh service
| Service | HTTP | gRPC |
| --- | --- | --- |
| api-gateway | 8080 | - |
| event | 8081 | - |
| queue | 8082 | - |
| seat-inventory | 8083 | 9083 |
| booking | 8084 | - |
| payment | 8085 | - |
| ticket | 8086 | - |
| notification | 8087 | - |
| ai-agent | 8088 | - |
