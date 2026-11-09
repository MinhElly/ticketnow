package com.minh.bookingservice.client;

import com.minh.bookingservice.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

@Component
@Slf4j
@ConditionalOnProperty(name = "seat-inventory.client", havingValue = "http")
public class HttpSeatInventoryClient implements SeatInventoryClient {

    private final RestClient restClient;

    public HttpSeatInventoryClient(@Value("${seat-inventory.url:http://localhost:8083}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    private String currentBearerToken() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            return "Bearer " + jwt.getToken().getTokenValue();
        }
        return null;
    }

    @Override
    public HoldResult holdSeats(String eventId, List<String> seatIds, String bookingId, int ttlSeconds) {
        HoldSeatsRequest request = HoldSeatsRequest.builder()
                .bookingId(bookingId)
                .seatIds(seatIds)
                .ttlSeconds(ttlSeconds)
                .build();

        var reqSpec = restClient.post()
                .uri("/api/v1/events/{eventId}/seats/hold", eventId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request);

        String token = currentBearerToken();
        if (token != null) {
            reqSpec.header("Authorization", token);
        }

        try {
            return reqSpec.retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, resp) -> {
                        // Keep processing in body below if 409
                    })
                    .body(HoldResult.class);
        } catch (Exception ex) {
            log.error("Error calling seat-inventory hold for booking {} on event {}: {}",
                    bookingId, eventId, ex.getMessage());
            throw ApiException.badRequest("Failed to connect to seat-inventory: " + ex.getMessage());
        }
    }

    @Override
    public void releaseSeats(String eventId, List<String> seatIds, String bookingId) {
        ReleaseSeatsRequest request = ReleaseSeatsRequest.builder()
                .bookingId(bookingId)
                .seatIds(seatIds)
                .build();

        var reqSpec = restClient.post()
                .uri("/api/v1/events/{eventId}/seats/release", eventId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request);

        String token = currentBearerToken();
        if (token != null) {
            reqSpec.header("Authorization", token);
        }

        try {
            reqSpec.retrieve().toBodilessEntity();
            log.info("Released {} seats on seat-inventory for booking {}", seatIds.size(), bookingId);
        } catch (Exception ex) {
            log.error("Error releasing seats on seat-inventory for booking {}: {}", bookingId, ex.getMessage());
        }
    }

    @Override
    public void confirmSeats(String eventId, List<String> seatIds, String bookingId) {
        ConfirmSeatsRequest request = ConfirmSeatsRequest.builder()
                .bookingId(bookingId)
                .seatIds(seatIds)
                .build();

        var reqSpec = restClient.post()
                .uri("/api/v1/events/{eventId}/seats/confirm", eventId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request);

        String token = currentBearerToken();
        if (token != null) {
            reqSpec.header("Authorization", token);
        }

        try {
            reqSpec.retrieve().toBodilessEntity();
            log.info("Confirmed {} seats on seat-inventory for booking {}", seatIds.size(), bookingId);
        } catch (Exception ex) {
            log.error("Error confirming seats on seat-inventory for booking {}: {}", bookingId, ex.getMessage());
            throw ApiException.badRequest("Failed to confirm seats in seat-inventory: " + ex.getMessage());
        }
    }
}
