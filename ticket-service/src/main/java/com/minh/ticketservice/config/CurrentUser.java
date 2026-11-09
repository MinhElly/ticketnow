package com.minh.ticketservice.config;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;

@Component
public class CurrentUser {

    public String subject() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            return jwt.getName();
        }
        return "anonymous";
    }

    public boolean isAdmin() {
        return hasRole("admin");
    }

    public boolean isOrganizer() {
        return hasRole("organizer");
    }

    public boolean isStaffOrAdmin() {
        return hasRole("admin") || hasRole("organizer") || hasRole("staff");
    }

    public boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        String expected = "ROLE_" + role;
        Collection<? extends GrantedAuthority> authorities = auth.getAuthorities();
        return authorities.stream().anyMatch(a -> expected.equalsIgnoreCase(a.getAuthority()));
    }
}
