package com.minh.paymentservice.gateway;

import com.minh.paymentservice.enums.PaymentProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;

@Component
public class PaymentGatewayFactory {

    private final Map<PaymentProvider, PaymentGatewayAdapter> adapters = new EnumMap<>(PaymentProvider.class);
    private final PaymentProvider defaultProvider;

    public PaymentGatewayFactory(
            PayOsPaymentAdapter payOsAdapter,
            MockPaymentAdapter mockAdapter,
            @Value("${payment.gateway.provider:mock}") String defaultProviderConfig) {
        adapters.put(PaymentProvider.PAYOS, payOsAdapter);
        adapters.put(PaymentProvider.MOCK, mockAdapter);

        PaymentProvider provider;
        try {
            provider = PaymentProvider.valueOf(defaultProviderConfig.trim().toUpperCase());
        } catch (Exception ex) {
            provider = PaymentProvider.MOCK;
        }
        this.defaultProvider = provider;
    }

    public PaymentGatewayAdapter getAdapter(PaymentProvider provider) {
        if (provider != null && adapters.containsKey(provider)) {
            return adapters.get(provider);
        }
        return adapters.get(defaultProvider);
    }

    public PaymentProvider getDefaultProvider() {
        return defaultProvider;
    }
}
