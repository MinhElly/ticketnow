package com.minh.seatinventory.strategy;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SeatLockStrategyFactory {

    private final ApplicationContext applicationContext;

    @Value("${seat.lock.strategy:redis}")
    private String strategyName;

    public SeatLockStrategy getStrategy() {
        return getStrategy(strategyName);
    }

    public SeatLockStrategy getStrategy(String name) {
        if (name == null) name = "redis";
        return switch (name.toLowerCase()) {
            case "pessimistic" -> applicationContext.getBean("pessimisticLockStrategy", SeatLockStrategy.class);
            case "optimistic" -> applicationContext.getBean("optimisticLockStrategy", SeatLockStrategy.class);
            case "redis" -> applicationContext.getBean("redisLuaLockStrategy", SeatLockStrategy.class);
            default -> throw new IllegalArgumentException("Unknown seat lock strategy: " + name);
        };
    }
}
