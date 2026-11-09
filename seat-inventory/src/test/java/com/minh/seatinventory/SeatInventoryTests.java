package com.minh.seatinventory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.minh.seatinventory.dto.request.ConfirmSeatsRequest;
import com.minh.seatinventory.dto.request.HoldSeatsRequest;
import com.minh.seatinventory.dto.request.InitSeatsRequest;
import com.minh.seatinventory.dto.request.ReleaseSeatsRequest;
import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.entity.SeatId;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.repository.SeatRepository;
import com.minh.seatinventory.scheduler.HoldExpiredWorker;
import com.minh.seatinventory.strategy.SeatLockStrategy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:inventorytest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=validate",
    "spring.jpa.show-sql=false",
    "seat.lock.strategy=pessimistic",
    "grpc.server.port=0",
    "seat.hold-expiry.initial-delay-ms=3600000",
    "seat.hold-expiry.sweep-interval-ms=3600000"
})
@Transactional
@Import(SeatInventoryTests.TestConfig.class)
class SeatInventoryTests {

    @Autowired WebApplicationContext context;
    @Autowired SeatRepository seatRepository;
    @Autowired ObjectMapper objectMapper;
    @Autowired @Qualifier("pessimisticLockStrategy") SeatLockStrategy pessimisticStrategy;
    @Autowired @Qualifier("optimisticLockStrategy") SeatLockStrategy optimisticStrategy;
    @Autowired HoldExpiredWorker holdExpiredWorker;

    MockMvc mvc;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        ObjectMapper objectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.findAndRegisterModules();
            return mapper;
        }

        @Bean
        RedisConnectionFactory redisConnectionFactory() {
            return Mockito.mock(RedisConnectionFactory.class);
        }

        @Bean
        StringRedisTemplate stringRedisTemplate(RedisConnectionFactory factory) {
            return Mockito.mock(StringRedisTemplate.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return token -> {
                String role = switch (token) {
                    case "organizer" -> "organizer";
                    case "admin" -> "admin";
                    case "customer" -> "customer";
                    default -> throw new BadJwtException("Invalid token");
                };
                return Jwt.withTokenValue(token)
                        .header("alg", "none")
                        .claim("sub", "user-" + role)
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
    }

    @Test
    void testInitializeSeats_OrganizerSuccess_CustomerForbidden() throws Exception {
        String eventId = "evt-init-test";
        var initRequest = InitSeatsRequest.builder()
                .seats(List.of(
                        new InitSeatsRequest.SeatSpec("A-01-01", "tier-vip"),
                        new InitSeatsRequest.SeatSpec("A-01-02", "tier-vip")
                ))
                .build();

        // Customer bị từ chối 403
        mvc.perform(post("/api/v1/events/{eventId}/seats/initialize", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(initRequest)))
                .andExpect(status().isForbidden());

        // Organizer thành công 201
        mvc.perform(post("/api/v1/events/{eventId}/seats/initialize", eventId)
                .header("Authorization", "Bearer organizer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(initRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2));

        assertThat(seatRepository.findById_EventId(eventId)).hasSize(2);
    }

    @Test
    void testHoldSeatsAllOrNothing_Pessimistic() throws Exception {
        String eventId = "evt-pessimistic-test";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "S-01")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "S-02")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "S-03")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        // Booking 1 giữ S-01, S-02 thành công
        var hold1 = HoldSeatsRequest.builder()
                .bookingId("bkg-001")
                .seatIds(List.of("S-01", "S-02"))
                .ttlSeconds(300)
                .build();

        mvc.perform(post("/api/v1/events/{eventId}/seats/hold", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(hold1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Booking 2 cố giữ S-02 và S-03 -> thất bại 409 (All-or-nothing: S-03 vẫn phải trống)
        var hold2 = HoldSeatsRequest.builder()
                .bookingId("bkg-002")
                .seatIds(List.of("S-02", "S-03"))
                .ttlSeconds(300)
                .build();

        mvc.perform(post("/api/v1/events/{eventId}/seats/hold", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(hold2)))
                .andExpect(status().isConflict());

        // Kiểm tra S-03 vẫn trống (AVAILABLE)
        Seat s03 = seatRepository.findById_EventIdAndId_SeatId(eventId, "S-03").orElseThrow();
        assertThat(s03.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
    }

    @Test
    void testHoldSeatsAllOrNothing_Optimistic() {
        String eventId = "evt-optimistic-test";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "OPT-01")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "OPT-02")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        var res1 = optimisticStrategy.hold(eventId, List.of("OPT-01", "OPT-02"), "bkg-opt-1", Duration.ofMinutes(5));
        assertThat(res1.isSuccess()).isTrue();

        // Lần 2 cố giữ OPT-02 -> Thất bại
        var res2 = optimisticStrategy.hold(eventId, List.of("OPT-02"), "bkg-opt-2", Duration.ofMinutes(5));
        assertThat(res2.isSuccess()).isFalse();
        assertThat(res2.getFailedSeatIds()).contains("OPT-02");
    }

    @Test
    void testReleaseAndConfirmFlow() throws Exception {
        String eventId = "evt-flow-test";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "F-01")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "F-02")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        // 1. Giữ F-01 và F-02
        var hold = HoldSeatsRequest.builder().bookingId("bkg-flow").seatIds(List.of("F-01", "F-02")).build();
        mvc.perform(post("/api/v1/events/{eventId}/seats/hold", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(hold)))
                .andExpect(status().isOk());

        // 2. Release F-01
        var release = ReleaseSeatsRequest.builder().bookingId("bkg-flow").seatIds(List.of("F-01")).build();
        mvc.perform(post("/api/v1/events/{eventId}/seats/release", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(release)))
                .andExpect(status().isNoContent());

        Seat f01 = seatRepository.findById_EventIdAndId_SeatId(eventId, "F-01").orElseThrow();
        assertThat(f01.getStatus()).isEqualTo(SeatStatus.AVAILABLE);

        // 3. Confirm F-02
        var confirm = ConfirmSeatsRequest.builder().bookingId("bkg-flow").seatIds(List.of("F-02")).build();
        mvc.perform(post("/api/v1/events/{eventId}/seats/confirm", eventId)
                .header("Authorization", "Bearer customer")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(confirm)))
                .andExpect(status().isNoContent());

        Seat f02 = seatRepository.findById_EventIdAndId_SeatId(eventId, "F-02").orElseThrow();
        assertThat(f02.getStatus()).isEqualTo(SeatStatus.SOLD);
    }

    @Test
    void testHoldExpiredWorker_ReleasesOnlyExpiredHeldSeats() {
        String eventId = "evt-hold-expired-test";
        Instant past = Instant.now().minusSeconds(60);
        Instant future = Instant.now().plusSeconds(600);

        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "EXP-01")).tierId("t1")
                        .status(SeatStatus.HELD).heldByBooking("bkg-expired").heldUntil(past).build(),
                Seat.builder().id(new SeatId(eventId, "EXP-02")).tierId("t1")
                        .status(SeatStatus.HELD).heldByBooking("bkg-active").heldUntil(future).build(),
                Seat.builder().id(new SeatId(eventId, "EXP-03")).tierId("t1")
                        .status(SeatStatus.AVAILABLE).build()
        ));

        holdExpiredWorker.releaseExpiredHolds();

        Seat expired = seatRepository.findById_EventIdAndId_SeatId(eventId, "EXP-01").orElseThrow();
        assertThat(expired.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
        assertThat(expired.getHeldByBooking()).isNull();
        assertThat(expired.getHeldUntil()).isNull();

        Seat active = seatRepository.findById_EventIdAndId_SeatId(eventId, "EXP-02").orElseThrow();
        assertThat(active.getStatus()).isEqualTo(SeatStatus.HELD);
        assertThat(active.getHeldByBooking()).isEqualTo("bkg-active");

        Seat available = seatRepository.findById_EventIdAndId_SeatId(eventId, "EXP-03").orElseThrow();
        assertThat(available.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
    }
}
