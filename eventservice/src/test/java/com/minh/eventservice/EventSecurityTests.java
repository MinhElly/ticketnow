package com.minh.eventservice;

import com.minh.eventservice.entity.*;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
 "spring.datasource.url=jdbc:h2:mem:securitytest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa", "spring.datasource.password=",
 "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.show-sql=false"
})
@Transactional
@Import(EventSecurityTests.Tokens.class)
class EventSecurityTests {
 @Autowired WebApplicationContext context;
 @Autowired EventRepository events;
 @Autowired VenueRepository venues;
 @Autowired TicketTierRepository tiers;
 // Mock only decoding; exercise the actual filters, role converter and services.
 @TestConfiguration(proxyBeanMethods = false)
 static class Tokens {
  @Bean JwtDecoder jwtDecoder() {
   return value -> {
    String role = switch (value) {
     case "owner", "other" -> "organizer";
     case "customer" -> "customer";
     case "admin" -> "admin";
     default -> throw new BadJwtException("Invalid token");
    };
    return Jwt.withTokenValue(value).header("alg", "RS256").subject(value)
     .claim("realm_access", Map.of("roles", List.of(role))).build();
   };
  }
 }
 MockMvc mvc;
 Venue venue;
 Event draft;
 TicketTier tier;
 @BeforeEach void setup() {
  mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
  venue = venues.saveAndFlush(new Venue("Hall", "Address", "HCM", 100));
  draft = event(EventStatus.DRAFT);
  tier = new TicketTier(); tier.setEvent(draft); tier.setName("VIP");
  tier.setPrice(BigDecimal.TEN); tier.setCurrency("VND");
  tier = tiers.saveAndFlush(tier);
 }
 Event event(EventStatus status) {
  Event e = new Event(); e.setTitle("Concert"); e.setVenue(venue); e.setOrganizerId("owner");
  e.setStartsAt(Instant.parse("2026-12-20T12:00:00Z"));
  e.setEndsAt(Instant.parse("2026-12-20T15:00:00Z")); e.setStatus(status);
  return events.saveAndFlush(e);
 }
 String body() {
  return """
   {"title":"Updated","venueId":"%s",
    "startsAt":"2026-12-20T12:00:00Z","endsAt":"2026-12-20T15:00:00Z"}
   """.formatted(venue.getId());
 }
 @Test void missingAndInvalidTokensAreUnauthorized() throws Exception {
  mvc.perform(get("/api/v1/events")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/events").header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
 }
 @Test void creationChecksRoleAndUsesSubject() throws Exception {
  mvc.perform(post("/api/v1/events").header("Authorization", "Bearer customer")
   .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/events").header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isCreated())
   .andExpect(jsonPath("$.organizerId").value("owner"));
 }
 @Test void draftsAndTiersArePrivate() throws Exception {
  String path = "/api/v1/events/" + draft.getId();
  for (String user : List.of("customer", "other")) {
   for (String suffix : List.of("", "/ticket-tiers", "/ticket-tiers/" + tier.getId())) {
    mvc.perform(get(path + suffix).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   }
  }
  for (String user : List.of("owner", "admin")) {
   for (String suffix : List.of("", "/ticket-tiers", "/ticket-tiers/" + tier.getId())) {
    mvc.perform(get(path + suffix).header("Authorization", "Bearer " + user)).andExpect(status().isOk());
   }
  }
 }
 @Test void publicDetailsAreReadableAndListsFilterBeforePagination() throws Exception {
  Event cancelled = event(EventStatus.CANCELLED);
  mvc.perform(get("/api/v1/events/" + cancelled.getId()).header("Authorization", "Bearer customer"))
   .andExpect(status().isForbidden());
  for (EventStatus status : List.of(EventStatus.PUBLISHED, EventStatus.ON_SALE, EventStatus.CLOSED)) {
   Event e = event(status);
   mvc.perform(get("/api/v1/events/" + e.getId()).header("Authorization", "Bearer customer")).andExpect(status().isOk());
  }
  mvc.perform(get("/api/v1/events?size=2").header("Authorization", "Bearer customer"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
   .andExpect(jsonPath("$.content.length()").value(2));
 }
 @Test void writesRequireOwnerOrAdmin() throws Exception {
  String path = "/api/v1/events/" + draft.getId();
  String tierPath = path + "/ticket-tiers";
  String tierBody = "{\"name\":\"Standard\",\"price\":20,\"currency\":\"VND\"}";
  for (String user : List.of("other", "customer")) {
   mvc.perform(put(path).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(body()))
    .andExpect(status().isForbidden());
   mvc.perform(delete(path).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(post(tierPath).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(tierBody))
    .andExpect(status().isForbidden());
   mvc.perform(put(tierPath + "/" + tier.getId()).header("Authorization", "Bearer " + user)
    .contentType(MediaType.APPLICATION_JSON).content(tierBody)).andExpect(status().isForbidden());
   mvc.perform(delete(tierPath + "/" + tier.getId()).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
  }
  mvc.perform(put(path).header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(body()))
   .andExpect(status().isOk());
  mvc.perform(post(tierPath).header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(tierBody))
   .andExpect(status().isCreated());
  mvc.perform(put(tierPath + "/" + tier.getId()).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(tierBody.replace("Standard", "VIP"))).andExpect(status().isOk());
  mvc.perform(delete(tierPath + "/" + tier.getId()).header("Authorization", "Bearer owner")).andExpect(status().isNoContent());
  mvc.perform(delete(path).header("Authorization", "Bearer admin")).andExpect(status().isNoContent());
 }
 @Test void publishedEventsRemainImmutableEvenForAdmin() throws Exception {
  draft.setStatus(EventStatus.PUBLISHED); events.saveAndFlush(draft);
  String path = "/api/v1/events/" + draft.getId();
  mvc.perform(put(path).header("Authorization", "Bearer admin").contentType(MediaType.APPLICATION_JSON).content(body()))
   .andExpect(status().isConflict());
  mvc.perform(delete(path).header("Authorization", "Bearer owner")).andExpect(status().isConflict());
  mvc.perform(delete(path + "/ticket-tiers/" + tier.getId()).header("Authorization", "Bearer admin"))
   .andExpect(status().isConflict());
 }
 @Test void venueWritesRequireAdmin() throws Exception {
  String body = "{\"name\":\"Hall\",\"address\":\"Address\",\"city\":\"HCM\",\"capacity\":100}";
  String path = "/api/v1/venues";
  for (String user : List.of("owner", "customer")) {
   mvc.perform(post(path).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(body))
    .andExpect(status().isForbidden());
   mvc.perform(put(path + "/" + venue.getId()).header("Authorization", "Bearer " + user)
    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
   mvc.perform(delete(path + "/" + venue.getId()).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
  }
  mvc.perform(post(path).header("Authorization", "Bearer admin").contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isCreated());
  mvc.perform(put(path + "/" + venue.getId()).header("Authorization", "Bearer admin")
   .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
 }
}
