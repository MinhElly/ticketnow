package com.minh.ticketservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.ticketservice.config.CurrentUser;
import com.minh.ticketservice.dto.event.EventEnvelope;
import com.minh.ticketservice.dto.event.TicketIssuedPayload;
import com.minh.ticketservice.dto.request.CheckInRequest;
import com.minh.ticketservice.dto.request.ManualIssueRequest;
import com.minh.ticketservice.dto.response.CheckInRecordResponse;
import com.minh.ticketservice.dto.response.CheckInResponse;
import com.minh.ticketservice.dto.response.TicketResponse;
import com.minh.ticketservice.entity.OutboxMessage;
import com.minh.ticketservice.entity.Ticket;
import com.minh.ticketservice.entity.TicketCheckIn;
import com.minh.ticketservice.enums.TicketStatus;
import com.minh.ticketservice.exception.ApiException;
import com.minh.ticketservice.repository.OutboxRepository;
import com.minh.ticketservice.repository.TicketCheckInRepository;
import com.minh.ticketservice.repository.TicketRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TicketService {

    private final TicketRepository ticketRepository;
    private final TicketCheckInRepository ticketCheckInRepository;
    private final OutboxRepository outboxRepository;
    private final QrCodeService qrCodeService;
    private final MinioStorageService minioStorageService;
    private final CurrentUser currentUser;
    private final ObjectMapper objectMapper;

    @Transactional
    public TicketResponse issueTicket(
            String bookingId,
            String eventId,
            String seatId,
            String seatCode,
            String tierName,
            BigDecimal price,
            String currency,
            String userId
    ) {
        String ticketId = UUID.randomUUID().toString();
        String datePrefix = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String randomSuffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String ticketCode = "TKT-" + datePrefix + "-" + randomSuffix;

        String qrPayload = qrCodeService.buildSignedPayload(ticketCode, ticketId, eventId, seatCode);
        byte[] qrImageBytes = qrCodeService.generateQrPng(qrPayload, 300, 300);
        String qrCodeUrl = minioStorageService.uploadQrCode(ticketCode, qrImageBytes);

        Ticket ticket = Ticket.builder()
                .id(ticketId)
                .ticketCode(ticketCode)
                .bookingId(bookingId)
                .eventId(eventId)
                .seatId(seatId)
                .seatCode(seatCode)
                .tierName(tierName)
                .price(price)
                .currency(currency != null ? currency : "VND")
                .userId(userId)
                .status(TicketStatus.VALID)
                .qrPayload(qrPayload)
                .qrCodeUrl(qrCodeUrl)
                .build();

        ticket = ticketRepository.save(ticket);
        log.info("Issued ticket {} (id: {}) for booking {}", ticketCode, ticketId, bookingId);

        // Record Outbox Event TicketIssued
        TicketIssuedPayload payload = new TicketIssuedPayload(
                ticketId,
                ticketCode,
                bookingId,
                eventId,
                seatId,
                seatCode,
                tierName,
                price,
                userId,
                qrCodeUrl
        );

        EventEnvelope<TicketIssuedPayload> envelope = new EventEnvelope<>(
                UUID.randomUUID().toString(),
                "TicketIssued",
                1,
                Instant.now(),
                ticketId,
                null,
                payload
        );

        try {
            OutboxMessage outbox = OutboxMessage.builder()
                    .id(UUID.randomUUID().toString())
                    .aggregateType("TICKET")
                    .aggregateId(ticketId)
                    .eventType("TicketIssued")
                    .payload(objectMapper.writeValueAsString(envelope))
                    .status("PENDING")
                    .build();
            outboxRepository.save(outbox);
        } catch (Exception e) {
            log.error("Failed to serialize TicketIssued outbox message: {}", e.getMessage(), e);
        }

        return toTicketResponse(ticket);
    }

    @Transactional
    public TicketResponse manualIssue(ManualIssueRequest request) {
        if (!currentUser.isStaffOrAdmin()) {
            throw ApiException.forbidden("Only staff or admin can manually issue tickets");
        }
        return issueTicket(
                request.bookingId(),
                request.eventId(),
                request.seatId(),
                request.seatCode(),
                request.tierName(),
                request.price(),
                request.currency(),
                request.userId()
        );
    }

    @Transactional
    public CheckInResponse checkIn(CheckInRequest request) {
        if (!currentUser.isStaffOrAdmin()) {
            throw ApiException.forbidden("Only staff, organizer, or admin can perform check-in");
        }

        String ticketCode = request.ticketCode();
        if ((ticketCode == null || ticketCode.isBlank()) && request.qrPayload() != null && !request.qrPayload().isBlank()) {
            boolean validSig = qrCodeService.verifySignedPayload(request.qrPayload());
            if (!validSig) {
                throw ApiException.badRequest("Invalid ticket QR signature - potential counterfeit or corrupted payload");
            }
            ticketCode = qrCodeService.extractTicketCodeFromPayload(request.qrPayload());
        }

        if (ticketCode == null || ticketCode.isBlank()) {
            throw ApiException.badRequest("Ticket code or valid QR payload must be provided for check-in");
        }

        Ticket ticket = ticketRepository.findByTicketCode(ticketCode)
                .orElseThrow(() -> ApiException.notFound("Ticket with code " + request.ticketCode()));

        if (ticket.getStatus() == TicketStatus.USED) {
            throw ApiException.conflict("Ticket " + ticket.getTicketCode() + " has already been used and cannot be checked in again");
        }
        if (ticket.getStatus() == TicketStatus.CANCELLED) {
            throw ApiException.badRequest("Ticket " + ticket.getTicketCode() + " has been cancelled");
        }
        if (ticket.getStatus() == TicketStatus.REFUNDED) {
            throw ApiException.badRequest("Ticket " + ticket.getTicketCode() + " has been refunded");
        }

        String staffSubject = currentUser.subject();
        TicketCheckIn checkIn = TicketCheckIn.builder()
                .id(UUID.randomUUID().toString())
                .ticket(ticket)
                .checkedInBy(staffSubject)
                .deviceInfo(request.deviceInfo() != null ? request.deviceInfo() : "GATE-SCANNER-01")
                .build();

        ticket.setStatus(TicketStatus.USED);
        ticketRepository.save(ticket);
        checkIn = ticketCheckInRepository.save(checkIn);

        log.info("Ticket {} checked in by {} on device {}", ticket.getTicketCode(), staffSubject, checkIn.getDeviceInfo());

        return new CheckInResponse(
                true,
                ticket.getTicketCode(),
                ticket.getEventId(),
                ticket.getSeatCode(),
                ticket.getTierName(),
                ticket.getStatus().name(),
                checkIn.getCheckedInAt(),
                "Check-in successfully completed for " + ticket.getTicketCode()
        );
    }

    @Transactional(readOnly = true)
    public List<TicketResponse> getMyTickets() {
        String userId = currentUser.subject();
        return ticketRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toTicketResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public TicketResponse getTicketById(String id) {
        Ticket ticket = ticketRepository.findByIdWithCheckIns(id)
                .orElseThrow(() -> ApiException.notFound("Ticket " + id));

        if (!ticket.getUserId().equals(currentUser.subject()) && !currentUser.isStaffOrAdmin()) {
            throw ApiException.forbidden("You do not have permission to view this ticket");
        }
        return toTicketResponse(ticket);
    }

    @Transactional(readOnly = true)
    public List<TicketResponse> getTicketsByBooking(String bookingId) {
        List<Ticket> tickets = ticketRepository.findByBookingId(bookingId);
        if (!tickets.isEmpty()) {
            String owner = tickets.get(0).getUserId();
            if (!owner.equals(currentUser.subject()) && !currentUser.isStaffOrAdmin()) {
                throw ApiException.forbidden("You do not have permission to view tickets for this booking");
            }
        }
        return tickets.stream().map(this::toTicketResponse).toList();
    }

    private TicketResponse toTicketResponse(Ticket t) {
        List<CheckInRecordResponse> checkIns = t.getCheckIns() != null
                ? t.getCheckIns().stream()
                .map(c -> new CheckInRecordResponse(c.getId(), c.getCheckedInBy(), c.getDeviceInfo(), c.getCheckedInAt()))
                .toList()
                : List.of();

        return new TicketResponse(
                t.getId(),
                t.getTicketCode(),
                t.getBookingId(),
                t.getEventId(),
                t.getSeatId(),
                t.getSeatCode(),
                t.getTierName(),
                t.getPrice(),
                t.getCurrency(),
                t.getUserId(),
                t.getStatus(),
                t.getQrCodeUrl(),
                t.getCreatedAt(),
                checkIns
        );
    }
}
