package com.minh.eventservice;

import com.minh.eventservice.dto.request.*;
import com.minh.eventservice.enums.EventStatus;
import com.minh.eventservice.service.*;
import com.minh.eventservice.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.minh.eventservice.client.SeatInventoryClient;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import java.time.Instant;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={
 "spring.datasource.url=jdbc:h2:mem:eventtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa", "spring.datasource.password=",
 "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.show-sql=false"
})
@Transactional
@Import(EventserviceApplicationTests.TestConfig.class)
class EventserviceApplicationTests {

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        SeatInventoryClient seatInventoryClient() {
            return Mockito.mock(SeatInventoryClient.class);
        }
    }
    @BeforeEach
    void authenticate() {
        var token = Jwt.withTokenValue("test").header("alg", "RS256")
                .subject("admin-test").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                token, java.util.List.of(new SimpleGrantedAuthority("ROLE_admin"))));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Autowired org.flywaydb.core.Flyway flyway;

    @Test
    void migrationIsAppliedAndSecondRunIsNoOp() {
        assertEquals("3", flyway.info().current().getVersion().toString());
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }

 @Autowired WebApplicationContext context;
 @Autowired VenueService venues;
 @Autowired EventService events;
 @Autowired TicketTierService tiers;
 @Autowired SeatSectionService sections;

 private EventRequest request(String venueId) {
  return new EventRequest("Concert","Demo",venueId,Instant.parse("2026-12-20T12:00:00Z"),Instant.parse("2026-12-20T15:00:00Z"));
 }
 @Test void httpValidationAndResourceContract() throws Exception {
  var mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity())
    .defaultRequest(get("/").with(jwt().jwt(j -> j.subject("admin-test"))
      .authorities(new SimpleGrantedAuthority("ROLE_admin")))).build();
  mvc.perform(post("/api/v1/venues").contentType(MediaType.APPLICATION_JSON)
    .content("{\"name\":\"Hall\",\"address\":\"123 Main\",\"city\":\"HCM\",\"capacity\":100}"))
    .andExpect(status().isCreated()).andExpect(header().exists("Location"));
  mvc.perform(post("/api/v1/venues").contentType(MediaType.APPLICATION_JSON).content("{}"))
    .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
  mvc.perform(get("/api/v1/events/missing")).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/events?size=101")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events?size=abc")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events/me?size=101")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events/me?size=abc")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events/me?page=-1")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events/me?status=INVALID")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/events/missing/sections")).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/events/missing/seatmap")).andExpect(status().isNotFound());
 }
 @Test void createReadUpdateAndDelete() {
  var venue=venues.create(new VenueRequest("Theater","123 Main","HCM",100));
  var event=events.create(request(venue.id()));
  assertEquals("DRAFT",event.status().name());
  assertEquals(venue.id(),events.get(event.id()).venueId());
  assertEquals(1, events.listMine(0, 20, null).totalElements());
  assertEquals(1, events.listMine(0, 20, EventStatus.DRAFT).totalElements());
  assertEquals(0, events.listMine(0, 20, EventStatus.PUBLISHED).totalElements());
  var tier=tiers.create(event.id(),new TicketTierRequest("VIP",new BigDecimal("500000.00"),"VND"));
  assertEquals(1,tiers.list(event.id()).size());
  tiers.update(event.id(),tier.id(),new TicketTierRequest("VIP",new BigDecimal("600000.00"),"VND"));
  assertEquals(0,new BigDecimal("600000.00").compareTo(tiers.get(event.id(),tier.id()).price()));

  var sec = sections.create(event.id(), new SeatSectionRequest("A", tier.id(), 2, 10));
  assertEquals(1, sections.list(event.id()).size());
  assertEquals(20, sections.get(event.id(), sec.id()).totalSeats());
  sections.update(event.id(), sec.id(), new SeatSectionRequest("A", tier.id(), 3, 10));
  assertEquals(30, sections.get(event.id(), sec.id()).totalSeats());

  var seatMap = sections.getSeatMap(event.id());
  assertEquals(100, seatMap.venueCapacity());
  assertEquals(30, seatMap.totalConfiguredSeats());
  assertEquals(1, seatMap.sections().size());
  assertEquals("A-01-01", seatMap.sections().get(0).seats().get(0).seatId());

  // cannot delete tier while in use by section
  assertThrows(ApiException.class, () -> tiers.delete(event.id(), tier.id()));
  sections.delete(event.id(), sec.id());
  assertEquals(0, sections.list(event.id()).size());

  assertThrows(ApiException.class,()->venues.delete(venue.id()));
  assertEquals(0,events.list(0,20).totalElements());
  events.delete(event.id());
  assertEquals(0, events.listMine(0, 20, null).totalElements());
  assertThrows(ApiException.class,()->events.get(event.id()));
  venues.delete(venue.id());
 }
 @Test void rejectsInvalidTimesMissingVenueAndDuplicateTiers() {
  assertThrows(ApiException.class,()->events.create(request("missing")));
  var venue=venues.create(new VenueRequest("Hall","Address","HCM",100));
  var r=request(venue.id());
  assertThrows(ApiException.class,()->events.create(new EventRequest("Bad",null,venue.id(),r.endsAt(),r.startsAt())));
  var event=events.create(r);
  var other=events.create(r);
  var tier=tiers.create(event.id(),new TicketTierRequest("VIP",BigDecimal.ONE,"VND"));
  assertThrows(ApiException.class,()->tiers.create(event.id(),new TicketTierRequest("vip",BigDecimal.ONE,"VND")));
  assertThrows(ApiException.class,()->tiers.get(other.id(),tier.id()));

  // section capacity check
  assertThrows(ApiException.class, () -> sections.create(event.id(), new SeatSectionRequest("BIG", tier.id(), 11, 10)));
  // section tier of another event check
  var otherTier = tiers.create(other.id(), new TicketTierRequest("OTHER", BigDecimal.ONE, "VND"));
  assertThrows(ApiException.class, () -> sections.create(event.id(), new SeatSectionRequest("CROSS", otherTier.id(), 1, 10)));

  // lifecycle transitions
  assertThrows(ApiException.class, () -> events.publish(event.id())); // no tier, no section
  var t = tiers.create(event.id(), new TicketTierRequest("E-TIER", BigDecimal.TEN, "VND"));
  assertThrows(ApiException.class, () -> events.publish(event.id())); // no section
  sections.create(event.id(), new SeatSectionRequest("S1", t.id(), 1, 5));
  var published = events.publish(event.id());
  assertEquals(EventStatus.PUBLISHED, published.status());
  var onSale = events.openOnSale(event.id());
  assertEquals(EventStatus.ON_SALE, onSale.status());
  var closed = events.close(event.id());
  assertEquals(EventStatus.CLOSED, closed.status());
 }
}
