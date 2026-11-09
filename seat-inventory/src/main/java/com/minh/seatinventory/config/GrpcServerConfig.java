package com.minh.seatinventory.config;

import com.minh.seatinventory.grpc.SeatInventoryGrpcService;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;

@Configuration
@Slf4j
public class GrpcServerConfig {

    /**
     * Starts the gRPC server on port 9083 by default, in parallel with the REST
     * server on 8083. Tests set grpc.server.port=0 to use an ephemeral port.
     */
    @Bean(destroyMethod = "shutdownNow")
    @ConditionalOnProperty(prefix = "grpc.server", name = "enabled", havingValue = "true", matchIfMissing = true)
    public Server grpcServer(
            @Value("${grpc.server.port:9083}") int port,
            SeatInventoryGrpcService seatInventoryGrpcService) throws IOException {
        Server server = ServerBuilder.forPort(port)
                .addService(seatInventoryGrpcService)
                .build()
                .start();
        log.info("SeatInventory gRPC server started on port {}", server.getPort());
        return server;
    }
}
