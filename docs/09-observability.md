# 09 – Observability

## 1. Metric tùy chỉnh
| Metric | Loại | Service |
| --- | --- | --- |
| ticketnow_queue_length{event} | Gauge | queue |
| ticketnow_queue_admit_total | Counter | queue |
| ticketnow_seat_hold_total{result} | Counter | seat-inventory |
| ticketnow_seat_hold_duration_seconds | Histogram | seat-inventory |
| ticketnow_seats_held / ticketnow_seats_sold | Gauge | seat-inventory |
| ticketnow_booking_total{status} | Counter | booking |
| ticketnow_payment_total{result} | Counter | payment |
| ticketnow_outbox_pending | Gauge | mọi service dùng outbox |
| resilience4j_circuitbreaker_state | Gauge | sẵn từ Resilience4j |
| kafka_consumergroup_lag | Gauge | kafka-exporter |
| ticketnow_llm_tokens_total{model,type} | Counter | ai-agent |
| ticketnow_llm_latency_seconds | Histogram | ai-agent |
| ticketnow_llm_cost_usd_total | Counter | ai-agent |

**[Bổ sung]** Bật `management.metrics.distribution.percentiles-histogram.ticketnow_seat_hold_duration_seconds=true` và khai báo SLO bucket (50 ms, 100 ms, 200 ms, 500 ms, 1 s). Tránh label cardinality cao (không dùng `userId`/`bookingId` làm label metric; đưa vào log/trace).

## 2. Dashboard Grafana
| Dashboard | Panel chính |
| --- | --- |
| Sale Day (demo) | Request/s, độ dài hàng đợi, ghế đã giữ/đã bán, tỉ lệ thanh toán thành công, p95 giữ ghế, số 429/503 |
| Service Health (RED) | Rate, Errors, Duration từng service |
| JVM và hạ tầng | Heap, GC, thread, connection pool, CPU/memory pod |
| Kafka và Saga | Consumer lag, throughput topic, DLT, outbox pending, số Saga đang chạy/bù trừ |
| Resilience | Trạng thái breaker, tỉ lệ lỗi, slow call, bulkhead đầy |
| AI/LLM | Token, chi phí, latency, tỉ lệ lỗi tool |

Dashboard lưu dạng JSON/provisioning trong `deploy/observability/` để dựng lại bằng một lệnh.

## 3. Alert rule
```yaml
groups:
- name: ticketnow
  rules:
  - alert: PaymentCircuitBreakerOpen
    expr: resilience4j_circuitbreaker_state{name="paymentGateway",state="open"} == 1
    for: 30s
    labels: {severity: critical}
  - alert: KafkaConsumerLagHigh
    expr: sum(kafka_consumergroup_lag{consumergroup="booking"}) > 5000
    for: 2m
    labels: {severity: warning}
  - alert: SeatHoldLatencyHigh
    expr: histogram_quantile(0.95, sum(rate(ticketnow_seat_hold_duration_seconds_bucket[1m])) by (le)) > 0.5
    for: 1m
    labels: {severity: warning}
  - alert: OutboxBacklog
    expr: ticketnow_outbox_pending > 1000
    for: 2m
    labels: {severity: warning}
  - alert: DeadLetterReceived
    expr: increase(kafka_topic_partition_current_offset{topic=~".*DLT"}[5m]) > 0
    labels: {severity: warning}
```
**[Bổ sung] Alert nên thêm:** `PodRestartLoop` (restart > 3/10 phút), `HighErrorRate5xx` (> 2% trong 2 phút), `SagaStuck` (số Saga RUNNING quá 5 phút > 0), `HoldReconcileMismatch` (job đối soát phát hiện lệch), `LLMBudgetExceeded`. Cấu hình `annotations.runbook_url` để Ops Agent `searchRunbook` có dữ liệu.

Alertmanager: route `critical` → webhook `POST /api/ops/alerts` của ai-agent và email; `warning` → email. Dùng `group_by: [alertname, service]` để tránh bão alert.

## 4. Log và Trace
- Logback JSON gồm `traceId`, `spanId`, `service`, `bookingId`; đẩy sang Loki bằng Alloy/Promtail.
- Grafana: **derived field** log → Tempo (theo `traceId`); **trace to logs** Tempo → Loki.
- Sampling: 100% khi dev; 5-10% khi load test. **[Bổ sung]** Dùng tail sampling (luôn giữ trace lỗi/chậm) nếu chạy OTel Collector.
- Che dữ liệu nhạy cảm (email, token) trong log.

```yaml
management:
  endpoints.web.exposure.include: health,info,prometheus
  tracing.sampling.probability: 1.0
  otlp.tracing.endpoint: http://tempo:4318/v1/traces
spring:
  kafka:
    template.observation-enabled: true
    listener.observation-enabled: true
```
**Mục tiêu demo:** một booking = một trace qua Gateway → booking → gRPC seat-inventory → Kafka → payment → ticket → notification. Với Outbox, cần lưu `traceparent` vào cột/payload của outbox để relay gắn lại vào Kafka header, nếu không trace sẽ đứt tại relay.

## 5. Luồng điều tra mẫu (cho báo cáo)
Alert `PaymentCircuitBreakerOpen` → dashboard Resilience → panel p95 payment tăng → Tempo tìm trace `payment-service` > 3 s → span `gateway-call` → "trace to logs" → Loki: `TimeoutException`. Ghi kết quả bằng ảnh chụp.
