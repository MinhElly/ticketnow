package com.minh.seatinventory.grpc;

import com.minh.seatinventory.dto.request.ConfirmSeatsRequest;
import com.minh.seatinventory.dto.request.HoldSeatsRequest;
import com.minh.seatinventory.dto.request.ReleaseSeatsRequest;
import com.minh.seatinventory.dto.response.HoldResult;
import com.minh.seatinventory.dto.response.SeatResponse;
import com.minh.seatinventory.service.SeatInventoryService;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/**
 * gRPC adapter for SeatInventoryService. It delegates all business rules to
 * the same application service used by the REST controller so both transports
 * share a single source of truth.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SeatInventoryGrpcService extends SeatInventoryGrpc.SeatInventoryImplBase {

    private final SeatInventoryService seatInventoryService;

    @Override
    public void holdSeats(HoldRequest request, StreamObserver<HoldResponse> responseObserver) {
        try {
            HoldSeatsRequest dto = HoldSeatsRequest.builder()
                    .bookingId(request.getBookingId())
                    .seatIds(request.getSeatIdsList())
                    .ttlSeconds(request.getTtlSeconds())
                    .build();

            HoldResult result = seatInventoryService.attemptHoldSeats(request.getEventId(), dto);

            HoldResponse.Builder response = HoldResponse.newBuilder()
                    .setSuccess(result.isSuccess())
                    .addAllFailedSeatIds(result.getFailedSeatIds() == null
                            ? List.of()
                            : result.getFailedSeatIds())
                    .setMessage(Objects.toString(result.getMessage(), ""));

            if (result.getExpiresAt() != null) {
                response.setExpiresAtEpoch(result.getExpiresAt().getEpochSecond());
            }

            responseObserver.onNext(response.build());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC HoldSeats failed for booking {} on event {}: {}",
                    request.getBookingId(), request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }

    @Override
    public void releaseSeats(ReleaseRequest request, StreamObserver<Empty> responseObserver) {
        try {
            ReleaseSeatsRequest dto = ReleaseSeatsRequest.builder()
                    .bookingId(request.getBookingId())
                    .seatIds(request.getSeatIdsList())
                    .build();
            seatInventoryService.releaseSeats(request.getEventId(), dto);
            responseObserver.onNext(Empty.getDefaultInstance());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC ReleaseSeats failed for booking {} on event {}: {}",
                    request.getBookingId(), request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }

    @Override
    public void confirmSeats(ConfirmRequest request, StreamObserver<Empty> responseObserver) {
        try {
            ConfirmSeatsRequest dto = ConfirmSeatsRequest.builder()
                    .bookingId(request.getBookingId())
                    .seatIds(request.getSeatIdsList())
                    .build();
            seatInventoryService.confirmSeats(request.getEventId(), dto);
            responseObserver.onNext(Empty.getDefaultInstance());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC ConfirmSeats failed for booking {} on event {}: {}",
                    request.getBookingId(), request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }

    @Override
    public void getAvailability(AvailabilityRequest request, StreamObserver<AvailabilityResponse> responseObserver) {
        try {
            List<SeatResponse> seats = seatInventoryService.getEventSeats(request.getEventId());
            AvailabilityResponse.Builder response = AvailabilityResponse.newBuilder();

            for (SeatResponse seat : seats) {
                SeatAvailability.Builder item = SeatAvailability.newBuilder()
                        .setSeatId(seat.getSeatId())
                        .setTierId(seat.getTierId())
                        .setStatus(seat.getStatus() == null ? "" : seat.getStatus().name());
                if (seat.getHeldUntil() != null) {
                    item.setHeldUntilEpoch(seat.getHeldUntil().getEpochSecond());
                }
                response.addSeats(item.build());
            }

            responseObserver.onNext(response.build());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC GetAvailability failed for event {}: {}", request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }

    @Override
    public void initializeSeats(com.minh.seatinventory.grpc.InitSeatsRequest request,
                                StreamObserver<Empty> responseObserver) {
        try {
            List<com.minh.seatinventory.dto.request.InitSeatsRequest.SeatSpec> specs = request.getSeatsList().stream()
                    .map(seat -> new com.minh.seatinventory.dto.request.InitSeatsRequest.SeatSpec(
                            seat.getSeatId(), seat.getTierId()))
                    .toList();
            com.minh.seatinventory.dto.request.InitSeatsRequest dto =
                    com.minh.seatinventory.dto.request.InitSeatsRequest.builder().seats(specs).build();
            seatInventoryService.initializeSeats(request.getEventId(), dto);
            responseObserver.onNext(Empty.getDefaultInstance());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC InitializeSeats failed for event {}: {}", request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }

    @Override
    public void revertSold(RevertRequest request, StreamObserver<Empty> responseObserver) {
        try {
            seatInventoryService.revertSold(
                    request.getEventId(),
                    request.getSeatIdsList(),
                    request.getBookingId());
            responseObserver.onNext(Empty.getDefaultInstance());
            responseObserver.onCompleted();
        } catch (Exception ex) {
            log.error("gRPC RevertSold failed for event {}: {}", request.getEventId(), ex.getMessage(), ex);
            responseObserver.onError(Status.INTERNAL
                    .withDescription(ex.getMessage())
                    .withCause(ex)
                    .asRuntimeException());
        }
    }
}
