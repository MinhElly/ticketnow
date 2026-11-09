package com.minh.seatinventory;

import com.minh.seatinventory.entity.Seat;
import com.minh.seatinventory.entity.SeatId;
import com.minh.seatinventory.enums.SeatStatus;
import com.minh.seatinventory.grpc.AvailabilityRequest;
import com.minh.seatinventory.grpc.AvailabilityResponse;
import com.minh.seatinventory.grpc.ConfirmRequest;
import com.minh.seatinventory.grpc.HoldRequest;
import com.minh.seatinventory.grpc.HoldResponse;
import com.minh.seatinventory.grpc.ReleaseRequest;
import com.minh.seatinventory.grpc.SeatInventoryGrpc;
import com.minh.seatinventory.repository.SeatRepository;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.Server;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real network integration test: Spring starts the gRPC server on an ephemeral
 * port (grpc.server.port=0) and the test invokes it with a blocking stub.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:inventorygrpc;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "seat.lock.strategy=pessimistic",
        "grpc.server.port=0",
        "seat.hold-expiry.initial-delay-ms=3600000",
        "seat.hold-expiry.sweep-interval-ms=3600000"
})
@Import(SeatInventoryGrpcTests.TestConfig.class)
class SeatInventoryGrpcTests {

    @Autowired
    Server grpcServer;

    @Autowired
    SeatRepository seatRepository;

    ManagedChannel channel;
    SeatInventoryGrpc.SeatInventoryBlockingStub stub;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
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
                throw new BadJwtException("Invalid token");
            };
        }
    }

    @BeforeEach
    void setUp() {
        channel = ManagedChannelBuilder.forAddress("localhost", grpcServer.getPort())
                .usePlaintext()
                .build();
        stub = SeatInventoryGrpc.newBlockingStub(channel).withDeadlineAfter(3, TimeUnit.SECONDS);
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        channel.shutdownNow().awaitTermination(3, TimeUnit.SECONDS);
    }

    @Test
    void testGrpcHoldAndReleaseSeats() {
        String eventId = "grpc-evt-hold-release";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "G-01")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "G-02")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        HoldResponse held = stub.holdSeats(HoldRequest.newBuilder()
                .setEventId(eventId)
                .setBookingId("grpc-bkg-01")
                .addAllSeatIds(List.of("G-01", "G-02"))
                .setUserId("grpc-user")
                .setTtlSeconds(300)
                .build());

        assertThat(held.getSuccess()).isTrue();
        assertThat(held.getFailedSeatIdsList()).isEmpty();
        assertThat(held.getExpiresAtEpoch()).isGreaterThan(Instant.now().getEpochSecond());
        assertThat(seatRepository.findById_EventIdAndId_SeatId(eventId, "G-01").orElseThrow().getStatus())
                .isEqualTo(SeatStatus.HELD);

        stub.releaseSeats(ReleaseRequest.newBuilder()
                .setEventId(eventId)
                .setBookingId("grpc-bkg-01")
                .addAllSeatIds(List.of("G-01", "G-02"))
                .build());

        assertThat(seatRepository.findById_EventIdAndId_SeatId(eventId, "G-01").orElseThrow().getStatus())
                .isEqualTo(SeatStatus.AVAILABLE);
        assertThat(seatRepository.findById_EventIdAndId_SeatId(eventId, "G-02").orElseThrow().getStatus())
                .isEqualTo(SeatStatus.AVAILABLE);
    }

    @Test
    void testGrpcHoldIsAllOrNothingAndIdempotentForSameBooking() {
        String eventId = "grpc-evt-conflict";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "C-01")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "C-02")).tierId("t1").status(SeatStatus.AVAILABLE).build(),
                Seat.builder().id(new SeatId(eventId, "C-03")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        HoldResponse first = stub.holdSeats(HoldRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-A")
                .addAllSeatIds(List.of("C-01", "C-02")).setTtlSeconds(300).build());
        assertThat(first.getSuccess()).isTrue();

        // Same booking may retry and refresh its own hold.
        HoldResponse retry = stub.holdSeats(HoldRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-A")
                .addAllSeatIds(List.of("C-01", "C-02")).setTtlSeconds(300).build());
        assertThat(retry.getSuccess()).isTrue();

        // Another booking fails on C-02 and must not leave C-03 held.
        HoldResponse conflict = stub.holdSeats(HoldRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-B")
                .addAllSeatIds(List.of("C-02", "C-03")).setTtlSeconds(300).build());
        assertThat(conflict.getSuccess()).isFalse();
        assertThat(conflict.getFailedSeatIdsList()).contains("C-02");
        assertThat(seatRepository.findById_EventIdAndId_SeatId(eventId, "C-03").orElseThrow().getStatus())
                .isEqualTo(SeatStatus.AVAILABLE);
    }

    @Test
    void testGrpcConfirmAvailabilityAndRevertSold() {
        String eventId = "grpc-evt-confirm-revert";
        seatRepository.saveAll(List.of(
                Seat.builder().id(new SeatId(eventId, "R-01")).tierId("t1").status(SeatStatus.AVAILABLE).build()
        ));

        stub.holdSeats(HoldRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-R")
                .addAllSeatIds(List.of("R-01")).setTtlSeconds(300).build());

        stub.confirmSeats(ConfirmRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-R")
                .addAllSeatIds(List.of("R-01")).build());

        AvailabilityResponse availability = stub.getAvailability(
                AvailabilityRequest.newBuilder().setEventId(eventId).build());
        assertThat(availability.getSeatsCount()).isEqualTo(1);
        assertThat(availability.getSeats(0).getStatus()).isEqualTo("SOLD");

        stub.revertSold(com.minh.seatinventory.grpc.RevertRequest.newBuilder()
                .setEventId(eventId).setBookingId("grpc-bkg-R")
                .addAllSeatIds(List.of("R-01")).build());

        assertThat(seatRepository.findById_EventIdAndId_SeatId(eventId, "R-01").orElseThrow().getStatus())
                .isEqualTo(SeatStatus.AVAILABLE);
    }
}
