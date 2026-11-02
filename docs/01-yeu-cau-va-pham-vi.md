# 01 – Yêu cầu và phạm vi

## 1. Bài toán
Concert mở bán 10:00, hàng chục nghìn người truy cập cùng lúc để giành vài nghìn vé (kịch bản demo: 50.000 người, 2.000 vé). Hệ thống phải đảm bảo:
- Không bán trùng một ghế cho hai người (no overselling).
- Không mất tiền, không trừ tiền hai lần.
- Không sập khi tải tăng đột biến; quá tải thì từ chối có kiểm soát (429/503).
- Ghế giữ tối đa 10 phút để thanh toán, hết hạn tự nhả.

## 2. Actor
| Actor | Mô tả | Use case chính |
| --- | --- | --- |
| Khách hàng | Người mua vé | Tìm sự kiện, vào hàng đợi, chọn ghế, thanh toán, nhận vé QR, hoàn vé, hỏi Customer Agent |
| Organizer | Ban tổ chức | Tạo sự kiện, cấu hình hạng vé, sơ đồ ghế, thời điểm mở bán |
| Nhân viên soát vé | Tại cổng | Quét QR |
| Admin/Ops | Vận hành | Giám sát, xử lý sự cố, nhận báo cáo Ops Agent |

**[Bổ sung] Vai trò Keycloak:** `customer`, `organizer`, `gate-staff`, `ops`. Gateway/Service kiểm tra role theo endpoint (ví dụ `POST /api/events` yêu cầu `organizer`; `POST /api/tickets/scan` yêu cầu `gate-staff`).

## 3. Phạm vi
**Trong phạm vi (MVP):**
- Quản lý sự kiện, hạng vé, sơ đồ ghế dạng lưới (khu, hàng, số ghế).
- Hàng đợi ảo và cấp queue token.
- Giữ ghế, nhả ghế, hết hạn giữ ghế.
- Đặt vé, thanh toán giả lập (mock cổng), hoàn tiền.
- Phát hành vé QR, soát vé.
- Email thông báo (MailHog).
- Customer Agent, Ops Agent.

**Ngoài phạm vi:** thanh toán thật, KYC, app mobile native, sơ đồ ghế đồ họa phức tạp, đa tiền tệ, đa ngôn ngữ.

## 4. Yêu cầu chức năng
| Mã | Yêu cầu | Service chính | Test chính |
| --- | --- | --- | --- |
| FR-01 | Organizer tạo sự kiện nhiều hạng vé + sơ đồ ghế | event | Integration |
| FR-02 | Xem/tìm kiếm sự kiện theo tên/ngày/địa điểm | event | Integration |
| FR-03 | Sự kiện mở bán nóng: phải vào hàng đợi, có queue token mới đặt vé | queue, gateway | E2E |
| FR-04 | Chọn 1-6 ghế, giữ 10 phút | seat-inventory, booking | Load S1-S4 |
| FR-05 | Thanh toán thành công → vé QR + email | payment, ticket, notification | E2E |
| FR-06 | Thanh toán lỗi/hết hạn giữ → nhả ghế, hủy booking | booking, seat-inventory | Chaos 1-2 |
| FR-07 | Xem lịch sử booking, vé của mình | booking, ticket | Integration |
| FR-08 | Hoàn vé theo chính sách; hoàn tiền + nhả ghế | booking, payment | E2E |
| FR-09 | Soát QR, vé chỉ dùng một lần | ticket | Concurrency test |
| FR-10 | Customer Agent: hỏi đáp, tra cứu, gợi ý, hỗ trợ đổi/hoàn | ai-agent | Eval thủ công |
| FR-11 | Ops Agent tóm tắt nguyên nhân khi có alert | ai-agent | 8 kịch bản chaos |

**[Bổ sung] Quy tắc nghiệp vụ cần chốt (nên ghi thành ADR):**
- Chính sách hoàn vé: mốc thời gian (ví dụ hoàn 100% trước 7 ngày, 50% trước 48 giờ, 0% sau đó). Cần để `checkRefundEligibility` có dữ liệu.
- Giới hạn 6 ghế/booking và có giới hạn số booking đồng thời đang giữ của một user (ví dụ 1) để chống đầu cơ.
- Chọn ghế khác hạng vé trong một booking: cho phép hay không.

## 5. Yêu cầu phi chức năng
| Mã | Yêu cầu | Mục tiêu đo (k6/test) | Cách kiểm chứng |
| --- | --- | --- | --- |
| NFR-01 | Không bán trùng | 0 ghế trùng sau mọi lần test | Truy vấn đối soát sau test |
| NFR-02 | Giữ ghế nhanh | p95 < 200 ms ở 1.000 req/s | k6 theo `http_req_duration{name:hold}` |
| NFR-03 | Chịu tải đột biến | 20.000 VU/60 s, 5xx < 1% (429 chấp nhận) | k6 `ramping-arrival-rate` |
| NFR-04 | Chịu lỗi payment | Payment chết, hold + xem sự kiện vẫn chạy | Chaos 2 |
| NFR-05 | Idempotency | Gửi trùng 10 lần chỉ trừ tiền 1 lần | Test tự động |
| NFR-06 | Không mất event | Kill Kafka/consumer, không mất, không trùng side-effect | Chaos 4, 8 |
| NFR-07 | Quan sát | 1 booking = 1 traceId qua mọi service | Demo Tempo/Loki |
| NFR-08 | Tự phục hồi | Kill 1 pod, hồi phục < 60 s | Chaos 3 |

## 6. Truy vết NFR → thành phần
| NFR | Cơ chế đáp ứng | Tài liệu |
| --- | --- | --- |
| NFR-01 | Redis Lua / SELECT FOR UPDATE, unique (event_id, seat_id) ở ticket | 07 |
| NFR-02/03 | Redis Lua, queue, rate limit, load shedding, HPA | 07, 08, 10 |
| NFR-04 | Circuit breaker, bulkhead, fallback `PENDING_GATEWAY` | 08 |
| NFR-05 | Idempotency-Key + unique + `webhook_log` | 08 |
| NFR-06 | Outbox, `processed_events`, DLT | 05 |
| NFR-07 | Micrometer Tracing, OTel, traceparent trong Kafka header | 09 |
| NFR-08 | K8s probes, replicas ≥ 2, PDB, KEDA/HPA | 10 |
