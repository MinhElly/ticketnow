# 12 – Cấu trúc repo và quy ước

## 1. Monorepo
```
ticketnow/
├── services/
│   ├── discovery-server/  config-server/  api-gateway/
│   ├── event-service/  queue-service/  seat-inventory-service/
│   ├── booking-service/  payment-service/  mock-payment-gateway/
│   └── ticket-service/  notification-service/  ai-agent-service/
├── contracts/
│   ├── proto/      # .proto dùng chung
│   ├── events/     # JSON Schema của event
│   └── openapi/    # OpenAPI từng service
├── deploy/
│   ├── compose/        # docker-compose.yml + profiles (infra, apps, observability)
│   ├── helm/           # chart chung + values từng service
│   ├── k8s/            # keda, ingress, namespace, network policy
│   └── observability/  # prometheus, grafana dashboards, loki, tempo, alert rules
├── config-repo/    # repo Git cho Config Server (hoặc submodule)
├── load-tests/     # k6 scripts + báo cáo kết quả
├── docs/           # kiến trúc, ADR, báo cáo, hình
└── .github/workflows/
```

## 2. Package trong mỗi service
```
com.ticketnow.booking
├── api/          # controller, DTO, exception handler
├── application/  # use case, saga orchestrator
├── domain/       # entity, state machine, domain event
├── infra/        # repository, kafka, grpc client, outbox, redis
└── config/
```
Quy tắc phụ thuộc: `api → application → domain`; `infra` triển khai interface do `domain/application` định nghĩa. `domain` không import Spring/Kafka/Redis. **[Bổ sung]** Kiểm tra bằng ArchUnit trong CI.

## 3. Quy ước chung
| Hạng mục | Quy ước |
| --- | --- |
| Lỗi API | RFC 7807 (`application/problem+json`) kèm `traceId` |
| Phân trang | `page`, `size`, trả `totalElements` |
| Version API | `/api/v1/...` |
| Thời gian | UTC, ISO-8601 |
| Tiền | `NUMERIC(12,2)`, không dùng double |
| ID | UUID v7 nếu có thể |
| Commit | Conventional Commits (`feat:`, `fix:`) |
| Nhánh | `main` + nhánh ngắn theo tính năng, PR qua CI |
| Quyết định kiến trúc | ADR ngắn ở `docs/adr/` |

**[Bổ sung] Nhất quán đường dẫn API:** tài liệu gốc dùng cả `/api/events` và `/api/v1/bookings`. Chọn một: tất cả `/api/v1/...`.

## 4. Danh sách ADR nên viết
| # | Quyết định | Lý do ngắn |
| --- | --- | --- |
| 001 | Saga orchestration, không choreography | Dễ theo dõi/debug |
| 002 | Redis Lua cho hold đường nóng | Throughput, nguyên tử |
| 003 | gRPC cho booking → seat-inventory | Latency, deadline |
| 004 | Outbox (polling) thay Debezium | Đơn giản, đủ cho đồ án |
| 005 | Idempotent consumer, at-least-once | Không có exactly-once end-to-end |
| 006 | Compose → K8s, bỏ Eureka/Config Server | Dùng nền tảng sẵn có |
| 007 | Queue token JWT bất đối xứng | Gateway xác minh không gọi queue-service |
| 008 | Tool Ops Agent chỉ đọc | An toàn vận hành |

Mẫu ADR: Bối cảnh – Quyết định – Phương án khác – Hệ quả.

## 5. Mẫu Makefile [Bổ sung]
```
make up-infra        # compose infra
make up-apps
make demo-reset      # reset DB, seed, flush Redis, tạo topic
make test-load       # k6
make fmt             # spotless
```
