package com.minh.bookingservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.bookingservice.client.HoldResult;
import com.minh.bookingservice.client.SeatInventoryClient;
import com.minh.bookingservice.dto.request.CreateBookingRequest;
import com.minh.bookingservice.repository.BookingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
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
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:bookingflowtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "seat-inventory.client=none"
})
@Transactional
@Import(BookingFlowTests.TestConfig.class)
class BookingFlowTests {

    @Autowired
    WebApplicationContext context;

    @Autowired
    BookingRepository bookingRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    SeatInventoryClient seatInventoryClient;

    MockMvc mvc;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        @org.springframework.context.annotation.Primary
        SeatInventoryClient seatInventoryClient() {
            return Mockito.mock(SeatInventoryClient.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return token -> {
                String role = switch (token) {
                    case "admin" -> "admin";
                    case "organizer" -> "organizer";
                    default -> {
                        if (token.startsWith("customer")) yield "customer";
                        throw new BadJwtException("Invalid token: " + token);
                    }
                };

                return Jwt.withTokenValue(token)
                        .header("alg", "none")
                        .subject(token)
                        .claim("sub", token)
                        .claim("realm_access", Map.of("roles", List.of(role)))
                        .issuedAt(Instant.now())
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .build();
            };
        }
    }

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        Mockito.reset(seatInventoryClient);
    }

    @Test
    void testCreateBooking_Success() throws Exception {
        String eventId = "evt-flow-1";
        var request = CreateBookingRequest.builder()
                .eventId(eventId)
                .seats(List.of(
                        new CreateBookingRequest.SeatSelection("A-01", "vip", new BigDecimal("500000.00")),
                        new CreateBookingRequest.SeatSelection("A-02", "vip", new BigDecimal("500000.00"))
                ))
                .build();

        Instant expiresAt = Instant.now().plusSeconds(600);
        Mockito.when(seatInventoryClient.holdSeats(eq(eventId), eq(List.of("A-01", "A-02")), anyString(), anyInt()))
                .thenReturn(HoldResult.builder().success(true).expiresAt(expiresAt).build());

        mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-123")
                        .header("Idempotency-Key", "idemp-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
                .andExpect(jsonPath("$.totalAmount").value(1000000.00))
                .andExpect(jsonPath("$.items.length()").value(2));

        assertThat(bookingRepository.findByUserIdAndIdempotencyKey("customer-123", "idemp-001")).isPresent();
    }

    @Test
    void testCreateBooking_SeatsUnavailable_ReturnsConflict() throws Exception {
        String eventId = "evt-flow-2";
        var request = CreateBookingRequest.builder()
                .eventId(eventId)
                .seats(List.of(new CreateBookingRequest.SeatSelection("B-01", "std", new BigDecimal("200000.00"))))
                .build();

        Mockito.when(seatInventoryClient.holdSeats(eq(eventId), anyList(), anyString(), anyInt()))
                .thenReturn(HoldResult.builder().success(false).failedSeatIds(List.of("B-01")).build());

        mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-123")
                        .header("Idempotency-Key", "idemp-002")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
    }

    @Test
    void testIdempotency_SameKeySamePayloadReturnsCached_DifferentPayloadReturns422() throws Exception {
        String eventId = "evt-flow-3";
        var request1 = CreateBookingRequest.builder()
                .eventId(eventId)
                .seats(List.of(new CreateBookingRequest.SeatSelection("C-01", "std", new BigDecimal("150000.00"))))
                .build();

        Mockito.when(seatInventoryClient.holdSeats(eq(eventId), eq(List.of("C-01")), anyString(), anyInt()))
                .thenReturn(HoldResult.builder().success(true).expiresAt(Instant.now().plusSeconds(600)).build());

        // Lần 1: Thành công
        String res1 = mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-idemp")
                        .header("Idempotency-Key", "idemp-same")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request1)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // Lần 2: Cùng key, cùng payload -> Trả lại kết quả cũ mà không gọi lại seatInventory
        String res2 = mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-idemp")
                        .header("Idempotency-Key", "idemp-same")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request1)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(res1).isEqualTo(res2);
        Mockito.verify(seatInventoryClient, Mockito.times(1)).holdSeats(anyString(), anyList(), anyString(), anyInt());

        // Lần 3: Cùng key, khác payload -> 422 Unprocessable Entity
        var requestDifferent = CreateBookingRequest.builder()
                .eventId(eventId)
                .seats(List.of(new CreateBookingRequest.SeatSelection("C-99", "std", new BigDecimal("150000.00"))))
                .build();

        mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-idemp")
                        .header("Idempotency-Key", "idemp-same")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestDifferent)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void testCancelAndConfirmBookingFlow() throws Exception {
        String eventId = "evt-flow-4";
        var request = CreateBookingRequest.builder()
                .eventId(eventId)
                .seats(List.of(new CreateBookingRequest.SeatSelection("D-01", "std", new BigDecimal("100000.00"))))
                .build();

        Mockito.when(seatInventoryClient.holdSeats(eq(eventId), anyList(), anyString(), anyInt()))
                .thenReturn(HoldResult.builder().success(true).expiresAt(Instant.now().plusSeconds(600)).build());

        String res = mvc.perform(post("/api/v1/bookings")
                        .header("Authorization", "Bearer customer-cancel")
                        .header("Idempotency-Key", "idemp-cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String bookingId = objectMapper.readTree(res).get("id").asText();

        // Non-owner truy cập -> 403 Forbidden
        mvc.perform(get("/api/v1/bookings/" + bookingId)
                        .header("Authorization", "Bearer customer-intruder"))
                .andExpect(status().isForbidden());

        // Owner truy cập -> 200 OK
        mvc.perform(get("/api/v1/bookings/" + bookingId)
                        .header("Authorization", "Bearer customer-cancel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(bookingId));

        // Hủy đơn -> gọi releaseSeats, status CANCELLED
        mvc.perform(post("/api/v1/bookings/" + bookingId + "/cancel")
                        .header("Authorization", "Bearer customer-cancel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        Mockito.verify(seatInventoryClient, Mockito.times(1)).releaseSeats(eq(eventId), eq(List.of("D-01")), eq(bookingId));
    }
}
