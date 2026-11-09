package com.minh.bookingservice.client;

import com.minh.bookingservice.exception.ApiException;
import com.minh.seatinventory.grpc.ConfirmRequest;
import com.minh.seatinventory.grpc.HoldRequest;
import com.minh.seatinventory.grpc.HoldResponse;
import com.minh.seatinventory.grpc.ReleaseRequest;
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

import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * gRPC implementation of SeatInventoryClient (the preferred transport).
 * Every call carries a hard deadline so a slow seat-inventory call can never
 * block a booking request for more than 500 ms by default.
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
            @Value("${seat-inventory.grpc.deadline-ms:500}") long deadlineMs) {
        this.channel = ManagedChannelBuilder.forAddress(host, port)
                .usePlaintext()
                .build();
        this.blockingStub = SeatInventoryGrpc.newBlockingStub(channel);
        this.deadlineMs = deadlineMs > 0 ? deadlineMs : 500;
        log.info("gRPC seat-inventory client configured for {}:{} (deadline {} ms)", host, port, this.deadlineMs);
    }

    @PreDestroy
    public void shutdown() {
        channel.shutdownNow();
        log.info("gRPC seat-inventory client channel shut down");
    }

    private SeatInventoryGrpc.SeatInventoryBlockingStub stubWithDeadline() {
        SeatInventoryGrpc.SeatInventoryBlockingStub stub =
                blockingStub.withDeadlineAfter(deadlineMs, TimeUnit.MILLISECONDS);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            Metadata metadata = new Metadata();
            metadata.put(AUTHORIZATION, "Bearer " + jwt.getToken().getTokenValue());
            return stub.withInterceptors(MetadataUtils.newAttachHeadersInterceptor(metadata));
        }
        return stub;
    }

    private String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? "" : auth.getName();
    }

    @Override
    public HoldResult holdSeats(String eventId, List<String> seatIds, String bookingId, int ttlSeconds) {
        HoldRequest request = HoldRequest.newBuilder()
                .setEventId(eventId)
                .addAllSeatIds(seatIds)
                .setBookingId(bookingId)
                .setUserId(currentUserId())
                .setTtlSeconds(ttlSeconds)
                .build();

        try {
            HoldResponse response = stubWithDeadline().holdSeats(request);
            return HoldResult.builder()
                    .success(response.getSuccess())
                    .failedSeatIds(response.getFailedSeatIdsList())
                    .expiresAt(response.getExpiresAtEpoch() > 0
                            ? Instant.ofEpochSecond(response.getExpiresAtEpoch())
                            : null)
                    .message(response.getMessage())
                    .build();
        } catch (StatusRuntimeException ex) {
            log.error("gRPC hold failed for booking {} on event {}: {}",
                    bookingId, eventId, ex.getStatus());
            throw ApiException.badRequest("Failed to hold seats via gRPC: " + ex.getStatus().getCode());
        }
    }

    @Override
    public void releaseSeats(String eventId, List<String> seatIds, String bookingId) {
        ReleaseRequest request = ReleaseRequest.newBuilder()
                .setEventId(eventId)
                .addAllSeatIds(seatIds)
                .setBookingId(bookingId)
                .build();

        try {
            stubWithDeadline().releaseSeats(request);
            log.info("Released {} seats via gRPC for booking {}", seatIds.size(), bookingId);
        } catch (StatusRuntimeException ex) {
            // Release is a compensation step: never fail the user-facing cancel.
            log.error("gRPC release failed for booking {} on event {}: {}",
                    bookingId, eventId, ex.getStatus());
        }
    }

    @Override
    public void confirmSeats(String eventId, List<String> seatIds, String bookingId) {
        ConfirmRequest request = ConfirmRequest.newBuilder()
                .setEventId(eventId)
                .addAllSeatIds(seatIds)
                .setBookingId(bookingId)
                .build();

        try {
            stubWithDeadline().confirmSeats(request);
            log.info("Confirmed {} seats via gRPC for booking {}", seatIds.size(), bookingId);
        } catch (StatusRuntimeException ex) {
            log.error("gRPC confirm failed for booking {} on event {}: {}",
                    bookingId, eventId, ex.getStatus());
            throw ApiException.badRequest("Failed to confirm seats via gRPC: " + ex.getStatus().getCode());
        }
    }
}
