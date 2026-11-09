package com.minh.eventservice.client;

import com.minh.eventservice.exception.ApiException;
import com.minh.seatinventory.grpc.InitSeatsRequest;
import com.minh.seatinventory.grpc.SeatInventoryGrpc;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.Metadata;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.MetadataUtils;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * gRPC client for initializing event seats on seat-inventory (Port 9083).
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "seat-inventory.client", havingValue = "grpc", matchIfMissing = true)
public class GrpcSeatInventoryClient implements SeatInventoryClient {

    private static final Metadata.Key<String> AUTHORIZATION =
            Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER);

    private final ManagedChannel channel;
    private final SeatInventoryGrpc.SeatInventoryBlockingStub blockingStub;
    private final long deadlineMs;

    public GrpcSeatInventoryClient(
            @Value("${seat-inventory.grpc.host:localhost}") String host,
            @Value("${seat-inventory.grpc.port:9083}") int port,
            @Value("${seat-inventory.grpc.deadline-ms:5000}") long deadlineMs) {
        this.channel = ManagedChannelBuilder.forAddress(host, port)
                .usePlaintext()
                .build();
        this.blockingStub = SeatInventoryGrpc.newBlockingStub(channel);
        this.deadlineMs = deadlineMs > 0 ? deadlineMs : 5000;
        log.info("gRPC seat-inventory client (eventservice) configured for {}:{} (deadline {} ms)",
                host, port, this.deadlineMs);
    }

    @PreDestroy
    public void shutdown() {
        channel.shutdownNow();
        log.info("gRPC seat-inventory client (eventservice) channel shut down");
    }

    @Override
    public void initializeSeats(String eventId, List<SeatSpec> seats) {
        if (seats == null || seats.isEmpty()) {
            return;
        }

        InitSeatsRequest.Builder requestBuilder = InitSeatsRequest.newBuilder()
                .setEventId(eventId);

        for (SeatSpec spec : seats) {
            requestBuilder.addSeats(com.minh.seatinventory.grpc.SeatSpec.newBuilder()
                    .setSeatId(spec.seatId())
                    .setTierId(spec.tierId())
                    .build());
        }

        InitSeatsRequest request = requestBuilder.build();
        SeatInventoryGrpc.SeatInventoryBlockingStub stub = stubWithDeadline();

        try {
            stub.initializeSeats(request);
            log.info("Successfully initialized {} seats via gRPC on seat-inventory for event {}",
                    seats.size(), eventId);
        } catch (StatusRuntimeException ex) {
            log.error("gRPC initializeSeats failed for event {}: {}", eventId, ex.getStatus(), ex);
            throw ApiException.badRequest("Failed to initialize seats in seat-inventory via gRPC: "
                    + ex.getStatus().getDescription());
        } catch (Exception ex) {
            log.error("Failed to initialize seats on seat-inventory for event {}: {}", eventId, ex.getMessage(), ex);
            throw ApiException.badRequest("Failed to initialize seats in seat-inventory: " + ex.getMessage());
        }
    }

    private SeatInventoryGrpc.SeatInventoryBlockingStub stubWithDeadline() {
        SeatInventoryGrpc.SeatInventoryBlockingStub stub =
                blockingStub.withDeadlineAfter(deadlineMs, TimeUnit.MILLISECONDS);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            Metadata headers = new Metadata();
            headers.put(AUTHORIZATION, "Bearer " + jwt.getToken().getTokenValue());
            return stub.withInterceptors(MetadataUtils.newAttachHeadersInterceptor(headers));
        }
        return stub;
    }
}
