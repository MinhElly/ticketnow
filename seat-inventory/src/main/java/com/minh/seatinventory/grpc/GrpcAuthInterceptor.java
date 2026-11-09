package com.minh.seatinventory.grpc;

import io.grpc.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Server interceptor that extracts caller Bearer token from gRPC metadata
 * and binds it to the gRPC Context for authenticated requests.
 */
@Component
@Slf4j
public class GrpcAuthInterceptor implements ServerInterceptor {

    public static final Metadata.Key<String> AUTHORIZATION_METADATA_KEY =
            Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER);

    public static final Context.Key<String> CALLER_TOKEN_CONTEXT_KEY =
            Context.key("caller_token");

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        String authHeader = headers.get(AUTHORIZATION_METADATA_KEY);
        Context ctx = Context.current();

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            ctx = ctx.withValue(CALLER_TOKEN_CONTEXT_KEY, token);
            log.debug("gRPC call {} received authenticated token",
                    call.getMethodDescriptor().getFullMethodName());
        }

        return Contexts.interceptCall(ctx, call, headers, next);
    }
}
