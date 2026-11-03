package com.newtonbrawl.auth.dto;

import com.newtonbrawl.player.dto.PlayerProfileDto;

import java.time.Instant;

public record AuthResponse(String token, String tokenType, Instant expiresAt, PlayerProfileDto player) {
    public AuthResponse(String token, Instant expiresAt, PlayerProfileDto player) {
        this(token, "Bearer", expiresAt, player);
    }
}
