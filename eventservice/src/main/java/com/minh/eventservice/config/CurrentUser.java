package com.minh.eventservice.config;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {

    private JwtAuthenticationToken authentication() {
        var authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (!(authentication instanceof JwtAuthenticationToken jwt)
                || !jwt.isAuthenticated()) {
            throw new AccessDeniedException("JWT authentication required");
        }

        return jwt;
    }

    public String subject() {
        String subject = authentication().getToken().getSubject();

        if (subject == null || subject.isBlank()) {
            throw new AccessDeniedException("JWT subject required");
        }

        return subject;
    }

    public boolean isAdmin() {
        return authentication().getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_admin"));
    }
}