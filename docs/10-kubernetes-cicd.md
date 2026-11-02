# 10 – Kubernetes, Docker Compose và CI/CD

## 1. Docker Compose theo profile
- `infra`: Postgres, Redis, Kafka (KRaft), Keycloak, MinIO, MailHog.
- `apps`: các service ứng dụng.
- `observability`: Prometheus, Grafana, Loki, Tempo, Alertmanager, kafka-exporter.
- Chạy: `docker compose --profile infra --profile apps up -d`. Máy yếu: chỉ bật `infra`, chạy service bằng IDE.

## 2. Bố cục cluster
| Namespace | Nội dung |
| --- | --- |
| ticketnow | Service ứng dụng |
| infra | Postgres, Redis, Kafka (Strimzi), MinIO, Keycloak |
| observability | Prometheus, Grafana, Loki, Tempo, Alertmanager, kafka-exporter |
| argocd | ArgoCD |

Mỗi service có: Deployment (requests/limits rõ ràng), Service, ConfigMap, Secret, HPA/ScaledObject, PodDisruptionBudget, probe `/actuator/health/liveness` + `/readiness`, graceful shutdown (`server.shutdown=graceful`, `terminationGracePeriodSeconds` > thời gian drain).

**[Bổ sung] Mẫu probe và tài nguyên**
```yaml
resources: { requests: {cpu: 250m, memory: 512Mi}, limits: {memory: 768Mi} }
readinessProbe: { httpGet: {path: /actuator/health/readiness, port: 8084}, periodSeconds: 5 }
livenessProbe:  { httpGet: {path: /actuator/health/liveness,  port: 8084}, initialDelaySeconds: 30 }
```
Với Java: đặt `-XX:MaxRAMPercentage=70`; replicas tối thiểu 2 cho service trên đường nóng để đạt NFR-08 (kill 1 pod vẫn phục vụ).

## 3. Autoscaling
- Gateway, queue-service, seat-inventory: HPA theo CPU 60%.
- booking, payment, ticket, notification: KEDA theo Kafka lag.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: booking-service
spec:
  scaleTargetRef:
    name: booking-service
  minReplicaCount: 2
  maxReplicaCount: 10
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka.infra:9092
      consumerGroup: booking
      topic: payment.events
      lagThreshold: '200'
```
Lưu ý: `maxReplicaCount` không nên vượt số partition (6) của topic; HPA đáp ứng chậm với spike → đặt `minReplicas` cao hơn trước giờ mở bán ("pre-warm") và nêu trong báo cáo.

## 4. Helm và GitOps
- Một chart chung `charts/microservice`; mỗi service chỉ có `values-{service}.yaml`.
- Hai repo: `ticketnow` (code) và `ticketnow-gitops` (manifest). CI cập nhật image tag trong gitops; ArgoCD đồng bộ (app-of-apps).

## 5. Pipeline GitHub Actions
1. Trigger: push/PR.
2. Build + unit test + integration test (Testcontainers).
3. Build image bằng Jib (không cần Dockerfile), đẩy GHCR.
4. Quét lỗ hổng (Trivy).
5. Commit image tag mới vào `ticketnow-gitops`.
6. ArgoCD sync; smoke test sau deploy.

**[Bổ sung]** Chỉ build service có thay đổi (`paths` filter hoặc matrix theo thư mục); cache Maven/Gradle; tag image bằng commit SHA, không dùng `latest`; chặn merge nếu Trivy có lỗ hổng CRITICAL.

## 6. Chuyển từ Compose lên K8s
| Thành phần | Compose | Kubernetes |
| --- | --- | --- |
| Service Discovery | Eureka, `lb://service` | Service DNS `http://service.ticketnow.svc` |
| Config | Config Server (Git) | ConfigMap/Secret, reload bằng Reloader hoặc rollout |
| Load balancing | Spring Cloud LoadBalancer | kube-proxy; gRPC cần headless Service hoặc Ingress/Envoy (HTTP/2 giữ kết nối) |
| Ingress | Gateway cổng 8080 | Ingress controller → Gateway |

Đây là mục riêng trong báo cáo: lý do học cả hai mô hình. **Vấn đề gRPC:** kết nối HTTP/2 dài làm kube-proxy dồn tải vào một pod; dùng headless Service + client-side round-robin (`dns:///seat-inventory-headless:9083`) hoặc service mesh/Envoy.

## 7. Bảo mật triển khai [Bổ sung]
- NetworkPolicy: chỉ Gateway được vào service ứng dụng; chỉ service sở hữu được vào DB của nó.
- Secret qua Sealed Secrets/External Secrets (hoặc tối thiểu K8s Secret, không commit giá trị).
- Image chạy non-root; tắt endpoint Actuator nhạy cảm ngoài `health,info,prometheus`; Prometheus scrape qua mạng nội bộ.
- Keycloak: realm export vào repo để dựng lại môi trường.
