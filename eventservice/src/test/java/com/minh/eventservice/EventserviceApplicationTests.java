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
import java.time.Instant;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={
 "spring.datasource.url=jdbc:h2:mem:eventtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa", "spring.datasource.password=",
 "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.show-sql=false"
})
@Transactional
class EventserviceApplicationTests {
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
        assertEquals("1", flyway.info().current().getVersion().toString());
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }

 @Autowired WebApplicationContext context;
 @Autowired VenueService venues;
 @Autowired EventService events;
 @Autowired TicketTierService tiers;
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
 }
}
