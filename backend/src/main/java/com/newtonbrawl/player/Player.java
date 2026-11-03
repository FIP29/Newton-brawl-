package com.newtonbrawl.player;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A registered player: credentials, public profile, record and ranked rating. */
@Entity
@Table(name = "players")
public class Player {

    public static final int STARTING_ELO = 1000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String username;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 32)
    private String displayName;

    @Column(nullable = false)
    private int elo = STARTING_ELO;

    @Column(name = "peak_elo", nullable = false)
    private int peakElo = STARTING_ELO;

    @Column(name = "ranked_games", nullable = false)
    private int rankedGames;

    @Column(nullable = false)
    private int wins;

    @Column(nullable = false)
    private int losses;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected Player() {
        // for JPA
    }

    public Player(String username, String email, String passwordHash, String displayName) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.createdAt = Instant.now();
    }

    public RankTier rankTier() {
        return RankTier.forElo(elo);
    }

    /** Applies a ranked result: new rating, one more ranked game, peak tracking. */
    public void applyRanked(int newElo) {
        this.elo = newElo;
        this.rankedGames++;
        this.peakElo = Math.max(peakElo, newElo);
    }

    public void recordWin() {
        wins++;
    }

    public void recordLoss() {
        losses++;
    }

    public void markLoggedIn() {
        this.lastLoginAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
    public int getElo() { return elo; }
    public int getPeakElo() { return peakElo; }
    public int getRankedGames() { return rankedGames; }
    public int getWins() { return wins; }
    public int getLosses() { return losses; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastLoginAt() { return lastLoginAt; }

    public void setDisplayName(String displayName) { this.displayName = displayName; }
}
