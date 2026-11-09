package com.minh.bookingservice;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:bookingtest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false",
        "booking.kafka.enabled=false"
})
@Import(BookingServiceApplicationTests.TestConfig.class)
class BookingServiceApplicationTests {

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        JwtDecoder jwtDecoder() {
            return value -> {
                throw new BadJwtException("Invalid token");
            };
        }
    }

    @Autowired
    private Flyway flyway;

    @Test
    void contextLoadsAndFlywayAppliesMigrations() {
        assertEquals("2", flyway.info().current().getVersion().toString());
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }
}
