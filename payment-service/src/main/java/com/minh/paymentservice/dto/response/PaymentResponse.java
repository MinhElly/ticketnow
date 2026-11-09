package com.minh.paymentservice.dto.response;

import com.minh.paymentservice.enums.PaymentProvider;
import com.minh.paymentservice.enums.PaymentStatus;
import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentResponse {
    private String id;
    private String bookingId;
    private String userId;
    private Long orderCode;
    private Long amount;
    private String currency;
    private PaymentStatus status;
    private PaymentProvider provider;
    private String paymentLinkId;
    private String checkoutUrl;
    private String qrCode;
    private String failureReason;
    private Instant paidAt;
    private Instant createdAt;
    private Instant updatedAt;
}
