package com.minh.ticketservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.ticketservice.service.QrCodeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class QrCodeServiceTests {

    private QrCodeService qrCodeService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        qrCodeService = new QrCodeService(objectMapper);
        ReflectionTestUtils.setField(qrCodeService, "qrSecret", "test_secret_key_12345");
    }

    @Test
    void shouldBuildAndVerifyValidSignedPayload() {
        String payload = qrCodeService.buildSignedPayload("TKT-001", "tid-123", "evt-456", "VIP-01");
        assertThat(payload).contains("TKT-001");
        assertThat(payload).contains("sig");

        boolean isValid = qrCodeService.verifySignedPayload(payload);
        assertThat(isValid).isTrue();

        String code = qrCodeService.extractTicketCodeFromPayload(payload);
        assertThat(code).isEqualTo("TKT-001");
    }

    @Test
    void shouldRejectTamperedPayload() {
        String payload = qrCodeService.buildSignedPayload("TKT-001", "tid-123", "evt-456", "VIP-01");

        // Tamper seat from VIP-01 to VIP-99
        String tampered = payload.replace("VIP-01", "VIP-99");
        boolean isValid = qrCodeService.verifySignedPayload(tampered);
        assertThat(isValid).isFalse();
    }

    @Test
    void shouldGeneratePngQrCode() {
        byte[] png = qrCodeService.generateQrPng("https://ticketnow.vn/verify", 200, 200);
        assertThat(png).isNotEmpty();
        // PNG magic number: 0x89 0x50 0x4E 0x47
        assertThat(png[0]).isEqualTo((byte) 0x89);
        assertThat(png[1]).isEqualTo((byte) 0x50);
        assertThat(png[2]).isEqualTo((byte) 0x4E);
        assertThat(png[3]).isEqualTo((byte) 0x47);
    }
}
