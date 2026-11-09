package com.minh.ticketservice.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.minh.ticketservice.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class QrCodeService {

    private final ObjectMapper objectMapper;

    @Value("${ticket.qr.secret:ticketnow_secret_qr_signature_key_2026}")
    private String qrSecret;

    public String buildSignedPayload(String ticketCode, String ticketId, String eventId, String seatCode) {
        String signature = computeHmacSha256(ticketCode + ":" + ticketId + ":" + eventId + ":" + seatCode);
        Map<String, String> payloadMap = new LinkedHashMap<>();
        payloadMap.put("code", ticketCode);
        payloadMap.put("tid", ticketId);
        payloadMap.put("eid", eventId);
        payloadMap.put("seat", seatCode);
        payloadMap.put("sig", signature);
        try {
            return objectMapper.writeValueAsString(payloadMap);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize QR payload", e);
        }
    }

    public boolean verifySignedPayload(String qrPayload) {
        try {
            Map<String, String> map = objectMapper.readValue(qrPayload, new TypeReference<>() {});
            String code = map.get("code");
            String tid = map.get("tid");
            String eid = map.get("eid");
            String seat = map.get("seat");
            String sig = map.get("sig");
            if (code == null || tid == null || eid == null || seat == null || sig == null) {
                return false;
            }
            String expected = computeHmacSha256(code + ":" + tid + ":" + eid + ":" + seat);
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    sig.getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception e) {
            log.warn("Failed to parse and verify QR payload: {}", e.getMessage());
            return false;
        }
    }

    public String extractTicketCodeFromPayload(String qrPayload) {
        try {
            Map<String, String> map = objectMapper.readValue(qrPayload, new TypeReference<>() {});
            return map.get("code");
        } catch (Exception e) {
            throw ApiException.badRequest("Invalid QR code payload format");
        }
    }

    public byte[] generateQrPng(String text, int width, int height) {
        try {
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            BitMatrix bitMatrix = qrCodeWriter.encode(text, BarcodeFormat.QR_CODE, width, height);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", outputStream);
            return outputStream.toByteArray();
        } catch (Exception e) {
            log.error("Failed to generate QR code PNG: {}", e.getMessage(), e);
            throw new RuntimeException("Error generating QR code", e);
        }
    }

    private String computeHmacSha256(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(qrSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hmacBytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hmacBytes);
        } catch (Exception e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }
}
