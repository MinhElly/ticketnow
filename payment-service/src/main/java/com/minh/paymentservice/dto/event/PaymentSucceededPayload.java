package com.minh.paymentservice.dto.event;

import com.minh.paymentservice.enums.PaymentProvider;
import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentSucceededPayload {
    private String paymentId;
    private String bookingId;
    private String userId;
    private Long orderCode;
    private Long amount;
    private String currency;
    private PaymentProvider provider;
    private Instant paidAt;
    private String transactionReference;
}
