package com.minh.eventservice;

import com.minh.eventservice.entity.*;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.repository.*;
import com.minh.eventservice.client.SeatInventoryClient;
import com.minh.eventservice.exception.ApiException;
import org.mockito.Mockito;
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
 @Autowired SeatSectionRepository sections;
 @Autowired SeatInventoryClient seatInventoryClient;
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
  @Bean SeatInventoryClient seatInventoryClient() {
   return Mockito.mock(SeatInventoryClient.class);
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
  return event("owner", status, "Concert");
 }
 Event event(String organizerId, EventStatus status, String title) {
  Event e = new Event(); e.setTitle(title); e.setVenue(venue); e.setOrganizerId(organizerId);
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
  mvc.perform(get("/api/v1/events")).andExpect(status().isOk());
  mvc.perform(get("/api/v1/events").header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/events/me")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/events/me").header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/events/" + draft.getId() + "/seatmap")).andExpect(status().isUnauthorized());
 }
 @Test void creationChecksRoleAndUsesSubject() throws Exception {
  mvc.perform(post("/api/v1/events").header("Authorization", "Bearer customer")
   .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/events").header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isCreated())
   .andExpect(jsonPath("$.organizerId").value("owner"));
 }
 @Test void draftsAndTiersAndSectionsArePrivate() throws Exception {
  String path = "/api/v1/events/" + draft.getId();
  for (String user : List.of("customer", "other")) {
   for (String suffix : List.of("", "/ticket-tiers", "/ticket-tiers/" + tier.getId(), "/sections", "/seatmap")) {
    mvc.perform(get(path + suffix).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   }
  }
  for (String user : List.of("owner", "admin")) {
   for (String suffix : List.of("", "/ticket-tiers", "/ticket-tiers/" + tier.getId(), "/sections", "/seatmap")) {
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
   mvc.perform(get("/api/v1/events/" + e.getId() + "/seatmap").header("Authorization", "Bearer customer")).andExpect(status().isOk());
  }
  mvc.perform(get("/api/v1/events?size=2").header("Authorization", "Bearer customer"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
   .andExpect(jsonPath("$.content.length()").value(2));
 }
 @Test void listMineEnforcesOrganizerScopeStatusAndPagination() throws Exception {
  event("owner", EventStatus.PUBLISHED, "Owner Published");
  event("other", EventStatus.DRAFT, "Other Draft");
  event("other", EventStatus.PUBLISHED, "Other Published");
  event("admin", EventStatus.DRAFT, "Admin Draft");

  mvc.perform(get("/api/v1/events/me").header("Authorization", "Bearer customer"))
   .andExpect(status().isForbidden());

  // owner has: draft (from setup), Owner Published (total: 2)
  mvc.perform(get("/api/v1/events/me").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(2))
   .andExpect(jsonPath("$.content[0].organizerId").value("owner"))
   .andExpect(jsonPath("$.content[1].organizerId").value("owner"));

  // owner filters by status DRAFT
  mvc.perform(get("/api/v1/events/me?status=DRAFT").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(1))
   .andExpect(jsonPath("$.content[0].id").value(draft.getId()))
   .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

  // owner filters by status PUBLISHED
  mvc.perform(get("/api/v1/events/me?status=PUBLISHED").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(1))
   .andExpect(jsonPath("$.content[0].status").value("PUBLISHED"))
   .andExpect(jsonPath("$.content[0].title").value("Owner Published"));

  // pagination check for owner
  mvc.perform(get("/api/v1/events/me?size=1&page=0").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(2))
   .andExpect(jsonPath("$.content.length()").value(1));

  // second organizer: other has 2 events, none belonging to owner
  mvc.perform(get("/api/v1/events/me").header("Authorization", "Bearer other"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(2))
   .andExpect(jsonPath("$.content[0].organizerId").value("other"))
   .andExpect(jsonPath("$.content[1].organizerId").value("other"));

  // other filters by DRAFT
  mvc.perform(get("/api/v1/events/me?status=DRAFT").header("Authorization", "Bearer other"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(1))
   .andExpect(jsonPath("$.content[0].title").value("Other Draft"))
   .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

  // other filters by CLOSED (none exists)
  mvc.perform(get("/api/v1/events/me?status=CLOSED").header("Authorization", "Bearer other"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(0))
   .andExpect(jsonPath("$.content.length()").value(0));

  // admin only sees events owned by admin (1 event), never owner's or other's
  mvc.perform(get("/api/v1/events/me").header("Authorization", "Bearer admin"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(1))
   .andExpect(jsonPath("$.content[0].organizerId").value("admin"))
   .andExpect(jsonPath("$.content[0].title").value("Admin Draft"));
 }
 @Test void writesRequireOwnerOrAdmin() throws Exception {
  String path = "/api/v1/events/" + draft.getId();
  String tierPath = path + "/ticket-tiers";
  String sectionPath = path + "/sections";
  String tierBody = "{\"name\":\"Standard\",\"price\":20,\"currency\":\"VND\"}";
  String sectionBody = "{\"name\":\"A\",\"tierId\":\"%s\",\"rowCount\":2,\"seatsPerRow\":10}".formatted(tier.getId());

  for (String user : List.of("other", "customer")) {
   mvc.perform(put(path).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(body()))
    .andExpect(status().isForbidden());
   mvc.perform(delete(path).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(post(tierPath).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(tierBody))
    .andExpect(status().isForbidden());
   mvc.perform(put(tierPath + "/" + tier.getId()).header("Authorization", "Bearer " + user)
    .contentType(MediaType.APPLICATION_JSON).content(tierBody)).andExpect(status().isForbidden());
   mvc.perform(delete(tierPath + "/" + tier.getId()).header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(post(sectionPath).header("Authorization", "Bearer " + user).contentType(MediaType.APPLICATION_JSON).content(sectionBody))
    .andExpect(status().isForbidden());
  }
  mvc.perform(put(path).header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(body()))
   .andExpect(status().isOk());
  mvc.perform(post(tierPath).header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(tierBody))
   .andExpect(status().isCreated());
  mvc.perform(put(tierPath + "/" + tier.getId()).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(tierBody.replace("Standard", "VIP"))).andExpect(status().isOk());

  // owner creates section
  var secRes = mvc.perform(post(sectionPath).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(sectionBody))
   .andExpect(status().isCreated())
   .andExpect(jsonPath("$.name").value("A"))
   .andExpect(jsonPath("$.totalSeats").value(20))
   .andReturn().getResponse().getContentAsString();
  String secId = new com.fasterxml.jackson.databind.ObjectMapper().readTree(secRes).get("id").asText();

  // other cannot update or delete section
  mvc.perform(put(sectionPath + "/" + secId).header("Authorization", "Bearer other")
   .contentType(MediaType.APPLICATION_JSON).content(sectionBody)).andExpect(status().isForbidden());
  mvc.perform(delete(sectionPath + "/" + secId).header("Authorization", "Bearer other")).andExpect(status().isForbidden());

  // owner updates section
  String updatedSection = "{\"name\":\"A\",\"tierId\":\"%s\",\"rowCount\":3,\"seatsPerRow\":10}".formatted(tier.getId());
  mvc.perform(put(sectionPath + "/" + secId).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(updatedSection))
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalSeats").value(30));

  // cannot delete tier that is in use by section
  mvc.perform(delete(tierPath + "/" + tier.getId()).header("Authorization", "Bearer owner"))
   .andExpect(status().isConflict());

  // owner deletes section
  mvc.perform(delete(sectionPath + "/" + secId).header("Authorization", "Bearer owner")).andExpect(status().isNoContent());

  // now tier can be deleted
  mvc.perform(delete(tierPath + "/" + tier.getId()).header("Authorization", "Bearer owner")).andExpect(status().isNoContent());
  mvc.perform(delete(path).header("Authorization", "Bearer admin")).andExpect(status().isNoContent());
 }
 @Test void publishedEventsRemainImmutableEvenForAdmin() throws Exception {
  draft.setStatus(EventStatus.PUBLISHED); events.saveAndFlush(draft);
  String path = "/api/v1/events/" + draft.getId();
  String sectionBody = "{\"name\":\"A\",\"tierId\":\"%s\",\"rowCount\":2,\"seatsPerRow\":10}".formatted(tier.getId());
  mvc.perform(put(path).header("Authorization", "Bearer admin").contentType(MediaType.APPLICATION_JSON).content(body()))
   .andExpect(status().isConflict());
  mvc.perform(delete(path).header("Authorization", "Bearer owner")).andExpect(status().isConflict());
  mvc.perform(delete(path + "/ticket-tiers/" + tier.getId()).header("Authorization", "Bearer admin"))
   .andExpect(status().isConflict());
  mvc.perform(post(path + "/sections").header("Authorization", "Bearer admin")
   .contentType(MediaType.APPLICATION_JSON).content(sectionBody)).andExpect(status().isConflict());
 }
 @Test void sectionValidationAndSeatMapContract() throws Exception {
  String sectionPath = "/api/v1/events/" + draft.getId() + "/sections";
  String bodyA = "{\"name\":\"A\",\"tierId\":\"%s\",\"rowCount\":2,\"seatsPerRow\":5}".formatted(tier.getId());
  mvc.perform(post(sectionPath).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(bodyA)).andExpect(status().isCreated());

  // duplicate name
  mvc.perform(post(sectionPath).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(bodyA)).andExpect(status().isConflict());

  // capacity violation (venue capacity is 100, section A has 10 seats, adding 95 exceeds 100)
  String excessBody = "{\"name\":\"B\",\"tierId\":\"%s\",\"rowCount\":10,\"seatsPerRow\":10}".formatted(tier.getId());
  mvc.perform(post(sectionPath).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(excessBody)).andExpect(status().isBadRequest());

  // tier from another event
  Event otherEvent = event("owner", EventStatus.DRAFT, "Other Event");
  TicketTier otherTier = new TicketTier();
  otherTier.setEvent(otherEvent); otherTier.setName("Other VIP");
  otherTier.setPrice(BigDecimal.ONE); otherTier.setCurrency("VND");
  otherTier = tiers.saveAndFlush(otherTier);

  String crossTierBody = "{\"name\":\"C\",\"tierId\":\"%s\",\"rowCount\":2,\"seatsPerRow\":5}".formatted(otherTier.getId());
  mvc.perform(post(sectionPath).header("Authorization", "Bearer owner")
   .contentType(MediaType.APPLICATION_JSON).content(crossTierBody)).andExpect(status().isBadRequest());

  // verify seatmap generation
  mvc.perform(get("/api/v1/events/" + draft.getId() + "/seatmap").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.venueCapacity").value(100))
   .andExpect(jsonPath("$.totalConfiguredSeats").value(10))
   .andExpect(jsonPath("$.sections.length()").value(1))
   .andExpect(jsonPath("$.sections[0].name").value("A"))
   .andExpect(jsonPath("$.sections[0].tier.name").value("VIP"))
   .andExpect(jsonPath("$.sections[0].seats.length()").value(10))
   .andExpect(jsonPath("$.sections[0].seats[0].seatId").value("A-01-01"))
   .andExpect(jsonPath("$.sections[0].seats[9].seatId").value("A-02-05"));
 }
 @Test void eventLifecycleTransitionsAndValidation() throws Exception {
  Event liveEvent = event("owner", EventStatus.DRAFT, "Live Event");
  String path = "/api/v1/events/" + liveEvent.getId();

  // customer or other organizer cannot trigger transitions
  for (String user : List.of("customer", "other")) {
   mvc.perform(post(path + "/publish").header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(put(path + "/on-sale").header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(post(path + "/close").header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
   mvc.perform(post(path + "/cancel").header("Authorization", "Bearer " + user)).andExpect(status().isForbidden());
  }

  // cannot publish without tiers
  mvc.perform(post(path + "/publish").header("Authorization", "Bearer owner"))
   .andExpect(status().isBadRequest());

  // add tier
  TicketTier t = new TicketTier();
  t.setEvent(liveEvent); t.setName("Standard"); t.setPrice(BigDecimal.TEN); t.setCurrency("VND");
  t = tiers.saveAndFlush(t);

  // cannot publish without sections
  mvc.perform(post(path + "/publish").header("Authorization", "Bearer owner"))
   .andExpect(status().isBadRequest());

  // add section
  SeatSection s = new SeatSection();
  s.setEvent(liveEvent); s.setTier(t); s.setName("SEC-A"); s.setRowCount(2); s.setSeatsPerRow(5);
  sections.saveAndFlush(s);

  // cannot open on-sale directly from DRAFT
  mvc.perform(put(path + "/on-sale").header("Authorization", "Bearer owner"))
   .andExpect(status().isConflict());

  // publish successfully
  mvc.perform(post(path + "/publish").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.status").value("PUBLISHED"));

  // cannot publish again
  mvc.perform(post(path + "/publish").header("Authorization", "Bearer owner"))
   .andExpect(status().isConflict());

  // open on-sale successfully
  mvc.perform(put(path + "/on-sale").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.status").value("ON_SALE"));

  // close event successfully
  mvc.perform(post(path + "/close").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.status").value("CLOSED"));

  // cannot cancel closed event
  mvc.perform(post(path + "/cancel").header("Authorization", "Bearer owner"))
   .andExpect(status().isConflict());

  // cancel another draft event
  Event draftToCancel = event("owner", EventStatus.DRAFT, "Cancel Me");
  String cancelPath = "/api/v1/events/" + draftToCancel.getId();
  mvc.perform(post(cancelPath + "/cancel").header("Authorization", "Bearer owner"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.status").value("CANCELLED"));

  // cannot cancel already cancelled event
  mvc.perform(post(cancelPath + "/cancel").header("Authorization", "Bearer owner"))
   .andExpect(status().isConflict());
 }
 @Test void publishFailsIfSeatInventoryFailsLeavesDraft() throws Exception {
  Event eventToPub = event("owner", EventStatus.DRAFT, "Pub Fail Test");
  TicketTier t = new TicketTier(); t.setEvent(eventToPub); t.setName("T");
  t.setPrice(BigDecimal.TEN); t.setCurrency("VND"); tiers.saveAndFlush(t);
  SeatSection sec = new SeatSection(); sec.setEvent(eventToPub); sec.setTier(t);
  sec.setName("S"); sec.setRowCount(1); sec.setSeatsPerRow(5);
  sec.setId(java.util.UUID.randomUUID().toString());
  sec.setCreatedAt(Instant.now()); sec.setUpdatedAt(Instant.now());
  sections.saveAndFlush(sec);

  Mockito.doThrow(ApiException.badRequest("Inventory unreachable"))
   .when(seatInventoryClient).initializeSeats(Mockito.eq(eventToPub.getId()), Mockito.anyList());

  mvc.perform(post("/api/v1/events/" + eventToPub.getId() + "/publish").header("Authorization", "Bearer owner"))
   .andExpect(status().isBadRequest());

  Event after = events.findById(eventToPub.getId()).orElseThrow();
  org.junit.jupiter.api.Assertions.assertEquals(EventStatus.DRAFT, after.getStatus());
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
