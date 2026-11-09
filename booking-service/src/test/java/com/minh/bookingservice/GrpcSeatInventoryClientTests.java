package com.minh.bookingservice;

import com.minh.bookingservice.client.GrpcSeatInventoryClient;
import com.minh.bookingservice.client.HoldResult;
import com.minh.bookingservice.exception.ApiException;
import com.minh.seatinventory.grpc.ConfirmRequest;
import com.minh.seatinventory.grpc.Empty;
import com.minh.seatinventory.grpc.HoldRequest;
import com.minh.seatinventory.grpc.HoldResponse;
import com.minh.seatinventory.grpc.ReleaseRequest;
import com.minh.seatinventory.grpc.SeatInventoryGrpc;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.stub.StreamObserver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GrpcSeatInventoryClientTests {

    private Server server;
    private GrpcSeatInventoryClient client;
    private FakeSeatInventory fake;
    private final AtomicReference<HoldRequest> lastHold = new AtomicReference<>();
    private final AtomicReference<ReleaseRequest> lastRelease = new AtomicReference<>();
    private final AtomicReference<ConfirmRequest> lastConfirm = new AtomicReference<>();

    class FakeSeatInventory extends SeatInventoryGrpc.SeatInventoryImplBase {
        HoldResponse holdResponse = HoldResponse.newBuilder()
                .setSuccess(true)
                .setMessage("held")
                .setExpiresAtEpoch(Instant.now().plusSeconds(600).getEpochSecond())
                .build();
        long holdDelayMs = 0;

        @Override
        public void holdSeats(HoldRequest request, StreamObserver<HoldResponse> observer) {
            lastHold.set(request);
            if (holdDelayMs > 0) {
                try {
                    Thread.sleep(holdDelayMs);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            observer.onNext(holdResponse);
            observer.onCompleted();
        }

        @Override
        public void releaseSeats(ReleaseRequest request, StreamObserver<Empty> observer) {
            lastRelease.set(request);
            observer.onNext(Empty.getDefaultInstance());
            observer.onCompleted();
        }

        @Override
        public void confirmSeats(ConfirmRequest request, StreamObserver<Empty> observer) {
            lastConfirm.set(request);
            observer.onNext(Empty.getDefaultInstance());
            observer.onCompleted();
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        fake = new FakeSeatInventory();
        server = ServerBuilder.forPort(0).addService(fake).build().start();
        client = new GrpcSeatInventoryClient("localhost", server.getPort(), 500);
    }

    @AfterEach
    void tearDown() {
        if (client != null) {
            client.shutdown();
        }
        if (server != null) {
            server.shutdownNow();
        }
    }

    @Test
    void testHoldSeatsMapsSuccessfulResponse() {
        HoldResult result = client.holdSeats("evt-grpc-client", List.of("A-01", "A-02"), "bkg-grpc-1", 300);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getFailedSeatIds()).isEmpty();
        assertThat(result.getExpiresAt()).isAfter(Instant.now());
        assertThat(lastHold.get().getEventId()).isEqualTo("evt-grpc-client");
        assertThat(lastHold.get().getBookingId()).isEqualTo("bkg-grpc-1");
        assertThat(lastHold.get().getSeatIdsList()).containsExactly("A-01", "A-02");
        assertThat(lastHold.get().getTtlSeconds()).isEqualTo(300);
    }

    @Test
    void testHoldSeatsMapsConflictResponseWithoutThrowing() {
        fake.holdResponse = HoldResponse.newBuilder()
                .setSuccess(false)
                .addAllFailedSeatIds(List.of("A-02"))
                .setMessage("seats unavailable")
                .build();

        HoldResult result = client.holdSeats("evt-grpc-client", List.of("A-01", "A-02"), "bkg-grpc-2", 300);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getFailedSeatIds()).containsExactly("A-02");
        assertThat(result.getExpiresAt()).isNull();
        assertThat(result.getMessage()).isEqualTo("seats unavailable");
    }

    @Test
    void testReleaseAndConfirmSeats() {
        client.releaseSeats("evt-grpc-client", List.of("A-01"), "bkg-grpc-3");
        client.confirmSeats("evt-grpc-client", List.of("A-01"), "bkg-grpc-3");

        assertThat(lastRelease.get().getBookingId()).isEqualTo("bkg-grpc-3");
        assertThat(lastRelease.get().getSeatIdsList()).containsExactly("A-01");
        assertThat(lastConfirm.get().getBookingId()).isEqualTo("bkg-grpc-3");
        assertThat(lastConfirm.get().getSeatIdsList()).containsExactly("A-01");
    }

    @Test
    void testDeadlineIsEnforced() {
        fake.holdDelayMs = 1_000;
        client.shutdown();
        client = new GrpcSeatInventoryClient("localhost", server.getPort(), 100);

        assertThatThrownBy(() ->
                client.holdSeats("evt-grpc-client", List.of("A-01"), "bkg-grpc-timeout", 300))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("DEADLINE_EXCEEDED");
    }
}
