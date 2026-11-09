package com.minh.paymentservice.dto.event;

import com.minh.paymentservice.enums.PaymentProvider;
import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentFailedPayload {
    private String paymentId;
    private String bookingId;
    private Long orderCode;
    private Long amount;
    private String currency;
    private PaymentProvider provider;
    private String reason;
    private Instant failedAt;
}
