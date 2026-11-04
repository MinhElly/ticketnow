package com.minh.eventservice.client;

import com.minh.eventservice.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class HttpSeatInventoryClient implements SeatInventoryClient {

    private final RestClient restClient;
    private final String baseUrl;

    public HttpSeatInventoryClient(@Value("${seat-inventory.url:http://localhost:8083}") String baseUrl) {
        this.baseUrl = baseUrl;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    @Override
    public void initializeSeats(String eventId, List<SeatSpec> seats) {
        String token = null;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            token = jwt.getToken().getTokenValue();
        }

        try {
            var request = restClient.post()
                    .uri("/api/v1/events/{eventId}/seats/initialize", eventId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("seats", seats));

            if (token != null) {
                request.header("Authorization", "Bearer " + token);
            }

            request.retrieve().toBodilessEntity();
            log.info("Successfully initialized {} seats on seat-inventory for event {}", seats.size(), eventId);
        } catch (Exception ex) {
            log.error("Failed to initialize seats on seat-inventory for event {}: {}", eventId, ex.getMessage());
            throw ApiException.badRequest("Failed to initialize seats in seat-inventory: " + ex.getMessage());
        }
    }
}
