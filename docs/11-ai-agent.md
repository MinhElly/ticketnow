# 11 – AI Agent

## 1. Kiến trúc
`ai-agent-service` dùng Spring AI (`ChatClient`, tool calling, advisor cho memory và RAG). Model cấu hình qua Config Server; dev dùng Ollama local, demo dùng API nhà cung cấp. pgvector lưu embedding. Mọi lời gọi LLM qua circuit breaker + timeout 20 s.

## 2. Customer Agent
| Tool | Loại | Ghi chú |
| --- | --- | --- |
| searchEvents(query, budget, date) | Đọc | Gọi event-service |
| getSeatAvailability(eventId, tier) | Đọc | Gọi seat-inventory |
| getMyBookings() | Đọc | userId từ JWT, không từ prompt |
| getBookingStatus(bookingId) | Đọc | Kiểm tra quyền sở hữu |
| getTicket(bookingId) | Đọc | Trả link QR |
| checkRefundEligibility(bookingId) | Đọc | Áp dụng chính sách hoàn vé |
| requestRefund(bookingId, reason) | Ghi | **Cần người dùng xác nhận** |

**RAG:** nguồn là chính sách hoàn/đổi, quy định sự kiện, FAQ (Markdown). Chunk ~500 token, overlap 50, top-k = 4; bắt buộc trích nguồn.

**Human-in-the-loop:** agent gọi `requestRefund` → service trả `PENDING_CONFIRMATION` + `confirmationId` + tóm tắt (số tiền, vé) → UI hiện nút Xác nhận → `POST /api/agent/confirm/{id}` mới thực thi.

**Guardrail bắt buộc**
1. `userId` luôn từ JWT, tool không nhận từ chat (chống mạo danh).
2. Không bịa giá, ghế, trạng thái: dữ kiện phải đến từ tool.
3. Giới hạn số bước tool mỗi lượt (ví dụ 5) và rate limit theo user.
4. Che thông tin cá nhân trong log và prompt.
5. Chống prompt injection: nội dung từ RAG/tool là dữ liệu, không phải chỉ thị.

**[Bổ sung] Hardening xác nhận:** `confirmationId` gắn `userId`, hết hạn sau 5 phút, dùng một lần, và hash của tham số để người dùng không bị đổi nội dung sau khi xem. Tool ghi gọi lại API nghiệp vụ bằng quyền của chính user (JWT chuyển tiếp), không dùng tài khoản dịch vụ quyền cao.

```java
chatClient.prompt()
    .system(systemPrompt)
    .user(question)
    .tools(bookingTools, eventTools)
    .advisors(QuestionAnswerAdvisor.builder(vectorStore).build())
    .call()
    .content();
```
(Kiểm tra cú pháp theo phiên bản Spring AI đang dùng vì API thay đổi theo bản.)

## 3. Ops Agent
**Luồng:** Alertmanager webhook → `POST /api/ops/alerts` → vòng suy luận với các tool **chỉ đọc** → báo cáo có cấu trúc → email/Slack + annotation Grafana.

| Tool | Mục đích |
| --- | --- |
| queryPrometheus(promql, range) | Số liệu |
| queryLoki(logql, range) | Log lỗi |
| searchTraces(service, minDuration, status) | Trace chậm/lỗi trên Tempo |
| getCircuitBreakerStates() | Trạng thái breaker |
| getKafkaLag(group) | Lag theo consumer group |
| getPodStatus(namespace) | Restart, OOMKilled (K8s API chỉ đọc) |
| searchRunbook(query) | RAG trên runbook |

**Đầu ra mẫu**
```json
{
  "summary": "payment-service lỗi timeout, circuit breaker đang OPEN",
  "probableCause": "Cổng thanh toán mock phản hồi chậm (p95 > 6s) từ 10:02",
  "evidence": ["resilience4j state=open từ 10:02:15", "Loki: 312 lỗi TimeoutException", "Trace abc123: span gateway-call 3.0s"],
  "suggestedActions": ["Kiểm tra cổng thanh toán", "Giữ fallback PENDING_GATEWAY", "Cân nhắc scale booking tạm thời"],
  "confidence": "medium"
}
```
Nguyên tắc: mặc định chỉ đọc; hành động thay đổi hệ thống (scale, restart) chỉ là đề xuất, cần người duyệt. **[Bổ sung]** Ràng buộc truy vấn: whitelist PromQL/LogQL (giới hạn range, số series), timeout từng tool, và luôn trả `evidence` có truy vết được (link dashboard/trace) để người duyệt kiểm chứng.

**Đánh giá (số liệu cho báo cáo):** 8-10 kịch bản chaos (file 14). Với mỗi kịch bản ghi: chẩn đoán đúng/sai, thời gian đến kết quả, token, số tool call.

| Kịch bản | Đúng? | Thời gian | Token | Tool call | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Payment chậm 8 s | | | | | |
| Payment chết | | | | | |
| Kafka lag | | | | | |
| Redis chậm | | | | | |
| Pod OOM | | | | | |
| DB hết connection | | | | | |

## 4. MCP
Bọc nhóm tool quan sát (Prometheus, Loki, Tempo) thành **MCP server** (Spring AI MCP server starter); Ops Agent là MCP client. Thử dùng cùng MCP server từ client khác để thấy lợi ích chuẩn hóa.

## 5. Quan sát và kiểm soát chi phí LLM
- Metric token, latency, chi phí theo model (file 09); span riêng cho mỗi lời gọi LLM và tool call, cùng trace.
- Timeout + breaker + fallback: LLM chậm → "Trợ lý đang bận, bạn thử lại sau"; chức năng khác không bị ảnh hưởng.
- Cache câu trả lời FAQ; giới hạn token đầu vào; ngân sách ngày (vượt thì chuyển model rẻ hoặc tắt).

## 6. Fraud/Bot Agent (tùy chọn)
Phân tích log gateway (tần suất join queue, nhiều tài khoản cùng IP, thời gian từ admit đến hold) để gắn cờ nghi vấn đầu cơ. Kết quả chỉ là gợi ý cho Ops, không tự khóa tài khoản.

## 7. Phạm vi nếu thiếu thời gian
6 tuần: chỉ làm Customer Agent bản đơn giản (RAG + 3 tool đọc). Ops Agent có thể rút gọn còn 3 tool (Prometheus, Loki, getCircuitBreakerStates).
