package com.minh.eventservice;

import com.minh.eventservice.client.GrpcSeatInventoryClient;
import com.minh.eventservice.client.SeatSpec;
import com.minh.eventservice.exception.ApiException;
import com.minh.seatinventory.grpc.Empty;
import com.minh.seatinventory.grpc.InitSeatsRequest;
import com.minh.seatinventory.grpc.SeatInventoryGrpc;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GrpcSeatInventoryClientTests {

    private Server server;
    private GrpcSeatInventoryClient client;
    private final AtomicReference<InitSeatsRequest> lastInit = new AtomicReference<>();
    private boolean shouldFail = false;

    class FakeSeatInventory extends SeatInventoryGrpc.SeatInventoryImplBase {
        @Override
        public void initializeSeats(InitSeatsRequest request, StreamObserver<Empty> responseObserver) {
            lastInit.set(request);
            if (shouldFail) {
                responseObserver.onError(Status.INTERNAL
                        .withDescription("Simulated DB failure")
                        .asRuntimeException());
                return;
            }
            responseObserver.onNext(Empty.getDefaultInstance());
            responseObserver.onCompleted();
        }
    }

    @BeforeEach
    void setup() throws IOException {
        server = ServerBuilder.forPort(0)
                .addService(new FakeSeatInventory())
                .build()
                .start();
        client = new GrpcSeatInventoryClient("localhost", server.getPort(), 2000);
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
    void initializeSeats_success() {
        List<SeatSpec> seats = List.of(
                new SeatSpec("A-1", "tier-vip"),
                new SeatSpec("A-2", "tier-vip")
        );

        client.initializeSeats("evt-123", seats);

        InitSeatsRequest captured = lastInit.get();
        assertThat(captured).isNotNull();
        assertThat(captured.getEventId()).isEqualTo("evt-123");
        assertThat(captured.getSeatsCount()).isEqualTo(2);
        assertThat(captured.getSeats(0).getSeatId()).isEqualTo("A-1");
        assertThat(captured.getSeats(1).getSeatId()).isEqualTo("A-2");
    }

    @Test
    void initializeSeats_emptyList_noop() {
        client.initializeSeats("evt-123", List.of());
        assertThat(lastInit.get()).isNull();
    }

    @Test
    void initializeSeats_error_mapsToApiException() {
        shouldFail = true;
        List<SeatSpec> seats = List.of(new SeatSpec("B-1", "tier-standard"));

        assertThatThrownBy(() -> client.initializeSeats("evt-err", seats))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Simulated DB failure");
    }
}
