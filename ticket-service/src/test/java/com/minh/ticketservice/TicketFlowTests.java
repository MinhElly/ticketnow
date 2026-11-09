package com.minh.ticketservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.ticketservice.dto.request.CheckInRequest;
import com.minh.ticketservice.dto.request.ManualIssueRequest;
import com.minh.ticketservice.entity.OutboxMessage;
import com.minh.ticketservice.entity.Ticket;
import com.minh.ticketservice.enums.TicketStatus;
import com.minh.ticketservice.repository.OutboxRepository;
import com.minh.ticketservice.repository.TicketCheckInRepository;
import com.minh.ticketservice.repository.TicketRepository;
import com.minh.ticketservice.service.QrCodeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ticketflowtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "minio.enabled=false",
        "ticket.kafka.enabled=false",
        "ticket.outbox.relay.enabled=false"
})
@Transactional
@Import(TicketFlowTests.TestConfig.class)
class TicketFlowTests {

    @Autowired
    WebApplicationContext context;

    @Autowired
    TicketRepository ticketRepository;

    @Autowired
    TicketCheckInRepository checkInRepository;

    @Autowired
    OutboxRepository outboxRepository;

    @Autowired
    QrCodeService qrCodeService;

    @Autowired
    ObjectMapper objectMapper;

    MockMvc mvc;

    @TestConfiguration
    static class TestConfig {
        @Bean
        JwtDecoder jwtDecoder() {
            return token -> {
                if ("customer-token".equals(token)) {
                    return Jwt.withTokenValue(token)
                            .header("alg", "none")
                            .subject("user-cust-01")
                            .claim("realm_access", Map.of("roles", List.of("customer")))
                            .issuedAt(Instant.now())
                            .expiresAt(Instant.now().plusSeconds(3600))
                            .build();
                } else if ("organizer-token".equals(token)) {
                    return Jwt.withTokenValue(token)
                            .header("alg", "none")
                            .subject("user-org-01")
                            .claim("realm_access", Map.of("roles", List.of("organizer")))
                            .issuedAt(Instant.now())
                            .expiresAt(Instant.now().plusSeconds(3600))
                            .build();
                } else if ("admin-token".equals(token)) {
                    return Jwt.withTokenValue(token)
                            .header("alg", "none")
                            .subject("user-admin-01")
                            .claim("realm_access", Map.of("roles", List.of("admin")))
                            .issuedAt(Instant.now())
                            .expiresAt(Instant.now().plusSeconds(3600))
                            .build();
                }
                throw new BadJwtException("Invalid token");
            };
        }

        @Bean
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, String> kafkaTemplate() {
            return Mockito.mock(KafkaTemplate.class);
        }
    }

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    @Test
    void shouldManuallyIssueTicketAndRecordOutbox() throws Exception {
        ManualIssueRequest req = new ManualIssueRequest(
                "bkg-flow-01",
                "evt-flow-01",
                "seat-flow-01",
                "A-01",
                "VIP",
                BigDecimal.valueOf(500000),
                "VND",
                "user-cust-01"
        );

        mvc.perform(post("/api/v1/tickets/manual-issue")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ticketCode").isNotEmpty())
                .andExpect(jsonPath("$.status").value("VALID"))
                .andExpect(jsonPath("$.seatCode").value("A-01"))
                .andExpect(jsonPath("$.qrCodeUrl").isNotEmpty());

        List<OutboxMessage> outbox = outboxRepository.findAll();
        assertThat(outbox).anyMatch(m -> "TicketIssued".equals(m.getEventType()));
    }

    @Test
    void shouldAllowCustomerToViewTheirTickets() throws Exception {
        ManualIssueRequest req = new ManualIssueRequest(
                "bkg-flow-02",
                "evt-flow-01",
                "seat-flow-02",
                "A-02",
                "STANDARD",
                BigDecimal.valueOf(250000),
                "VND",
                "user-cust-01"
        );

        mvc.perform(post("/api/v1/tickets/manual-issue")
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/tickets/my-tickets")
                        .header("Authorization", "Bearer customer-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].userId").value("user-cust-01"));
    }

    @Test
    void shouldCheckInSuccessfullyAndRejectSecondCheckIn() throws Exception {
        ManualIssueRequest req = new ManualIssueRequest(
                "bkg-flow-03",
                "evt-flow-01",
                "seat-flow-03",
                "B-01",
                "VIP",
                BigDecimal.valueOf(500000),
                "VND",
                "user-cust-01"
        );

        String createResp = mvc.perform(post("/api/v1/tickets/manual-issue")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String ticketCode = objectMapper.readTree(createResp).get("ticketCode").asText();

        // 1st Check-in -> Success
        CheckInRequest checkInReq = new CheckInRequest(ticketCode, null, "GATE-NORTH-01");
        mvc.perform(post("/api/v1/tickets/check-in")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(checkInReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.status").value("USED"));

        Ticket updatedTicket = ticketRepository.findByTicketCode(ticketCode).orElseThrow();
        assertThat(updatedTicket.getStatus()).isEqualTo(TicketStatus.USED);

        // 2nd Check-in -> Conflict 409
        mvc.perform(post("/api/v1/tickets/check-in")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(checkInReq)))
                .andExpect(status().isConflict());
    }

    @Test
    void shouldCheckInWithSignedQrPayloadAndRejectTamperedPayload() throws Exception {
        ManualIssueRequest req = new ManualIssueRequest(
                "bkg-flow-04",
                "evt-flow-01",
                "seat-flow-04",
                "C-01",
                "VIP",
                BigDecimal.valueOf(500000),
                "VND",
                "user-cust-01"
        );

        mvc.perform(post("/api/v1/tickets/manual-issue")
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());

        Ticket ticket = ticketRepository.findByBookingId("bkg-flow-04").get(0);
        String validQrPayload = ticket.getQrPayload();

        // Tampered payload
        String tamperedQrPayload = validQrPayload.replace("C-01", "VIP-99");
        CheckInRequest tamperedReq = new CheckInRequest(null, tamperedQrPayload, "SCANNER-02");

        mvc.perform(post("/api/v1/tickets/check-in")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(tamperedReq)))
                .andExpect(status().isBadRequest());

        // Valid payload check-in
        CheckInRequest validReq = new CheckInRequest(null, validQrPayload, "SCANNER-02");
        mvc.perform(post("/api/v1/tickets/check-in")
                        .header("Authorization", "Bearer organizer-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.status").value("USED"));
    }
}
