package com.minh.seatinventory.strategy;

import com.minh.seatinventory.dto.response.HoldResult;

import java.time.Duration;
import java.util.List;

public interface SeatLockStrategy {

    /**
     * Giữ danh sách ghế nguyên tử (all-or-nothing).
     * Nếu 1 ghế bất kỳ không khả dụng thì hủy và trả về danh sách ghế thất bại.
     */
    HoldResult hold(String eventId, List<String> seatIds, String bookingId, Duration ttl);

    /**
     * Giải phóng ghế đã giữ khi người dùng hủy hoặc hết hạn thanh toán.
     */
    void release(String eventId, List<String> seatIds, String bookingId);

    /**
     * Xác nhận thanh toán thành công: chuyển HELD -> SOLD.
     */
    void confirm(String eventId, List<String> seatIds, String bookingId);

    /**
     * Hoàn vé: chuyển SOLD -> AVAILABLE. Nếu bookingId được cung cấp, chỉ hoàn
     * các ghế thuộc booking đó. Gọi lặp lại là no-op.
     */
    void revertSold(String eventId, List<String> seatIds, String bookingId);
}
