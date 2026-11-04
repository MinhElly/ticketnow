package com.minh.seatinventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EnableJpaRepositories(basePackages = "com.minh.seatinventory.repository")
public class SeatInventoryApplication {

    public static void main(String[] args) {
        SpringApplication.run(SeatInventoryApplication.class, args);
    }
}
