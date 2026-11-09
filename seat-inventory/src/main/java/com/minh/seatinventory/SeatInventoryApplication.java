package com.minh.seatinventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableJpaRepositories(basePackages = "com.minh.seatinventory.repository")
@EnableScheduling
public class SeatInventoryApplication {

    public static void main(String[] args) {
        SpringApplication.run(SeatInventoryApplication.class, args);
    }
}
