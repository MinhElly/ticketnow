package com.minh.seatinventory;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.mockito.Mockito;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:inventorytest;MODE=MariaDB;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=validate",
    "spring.jpa.show-sql=false",
    "grpc.server.port=0"
})
@Import(SeatInventoryApplicationTests.TestConfig.class)
class SeatInventoryApplicationTests {

    @TestConfiguration(proxyBeanMethods = false)
    static class TestConfig {
        @Bean
        RedisConnectionFactory redisConnectionFactory() {
            return Mockito.mock(RedisConnectionFactory.class);
        }

        @Bean
        StringRedisTemplate stringRedisTemplate(RedisConnectionFactory factory) {
            return Mockito.mock(StringRedisTemplate.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return value -> {
                throw new BadJwtException("Invalid token");
            };
        }
    }

    @Test
    void contextLoads() {
    }
}
