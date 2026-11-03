package com.newtonbrawl.player.dto;

import com.newtonbrawl.player.Player;

import java.time.Instant;

/** Public profile as returned by the API (never includes the email or password hash). */
public record PlayerProfileDto(long id, String username, String displayName, int elo,
                               String rankTier, String rankTierName, int wins, int losses,
                               double winRate, Instant createdAt) {

    public static PlayerProfileDto from(Player p) {
        int games = p.getWins() + p.getLosses();
        double winRate = games == 0 ? 0.0 : Math.round(1000.0 * p.getWins() / games) / 10.0;
        return new PlayerProfileDto(p.getId(), p.getUsername(), p.getDisplayName(), p.getElo(),
            p.rankTier().name(), p.rankTier().displayName(), p.getWins(), p.getLosses(),
            winRate, p.getCreatedAt());
    }
}
