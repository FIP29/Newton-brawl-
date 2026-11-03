package com.newtonbrawl.history;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** One finished match (match history). */
@Entity
@Table(name = "matches")
public class MatchRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private MatchMode mode;

    @Column(name = "p1_id", nullable = false) private long p1Id;
    @Column(name = "p2_id", nullable = false) private long p2Id;
    @Column(name = "p1_fighter", nullable = false, length = 32) private String p1Fighter;
    @Column(name = "p2_fighter", nullable = false, length = 32) private String p2Fighter;
    @Column(name = "winner_slot", nullable = false) private int winnerSlot;
    @Column(nullable = false, length = 16) private String reason;
    @Column(name = "p1_rounds", nullable = false) private int p1Rounds;
    @Column(name = "p2_rounds", nullable = false) private int p2Rounds;
    @Column(name = "p1_elo_before", nullable = false) private int p1EloBefore;
    @Column(name = "p1_elo_after", nullable = false) private int p1EloAfter;
    @Column(name = "p2_elo_before", nullable = false) private int p2EloBefore;
    @Column(name = "p2_elo_after", nullable = false) private int p2EloAfter;
    @Column(name = "duration_ticks", nullable = false) private long durationTicks;
    @Column(name = "played_at", nullable = false) private Instant playedAt;

    protected MatchRecord() {}

    public MatchRecord(MatchMode mode, long p1Id, long p2Id, String p1Fighter, String p2Fighter, int winnerSlot,
                       String reason, int p1Rounds, int p2Rounds, int p1EloBefore, int p1EloAfter,
                       int p2EloBefore, int p2EloAfter, long durationTicks) {
        this.mode = mode;
        this.p1Id = p1Id;
        this.p2Id = p2Id;
        this.p1Fighter = p1Fighter;
        this.p2Fighter = p2Fighter;
        this.winnerSlot = winnerSlot;
        this.reason = reason;
        this.p1Rounds = p1Rounds;
        this.p2Rounds = p2Rounds;
        this.p1EloBefore = p1EloBefore;
        this.p1EloAfter = p1EloAfter;
        this.p2EloBefore = p2EloBefore;
        this.p2EloAfter = p2EloAfter;
        this.durationTicks = durationTicks;
        this.playedAt = Instant.now();
    }

    /** 0 or 1 if the player took part, else -1. */
    public int slotOf(long playerId) {
        return p1Id == playerId ? 0 : p2Id == playerId ? 1 : -1;
    }

    public Long getId() { return id; }
    public MatchMode getMode() { return mode; }
    public long getP1Id() { return p1Id; }
    public long getP2Id() { return p2Id; }
    public String getP1Fighter() { return p1Fighter; }
    public String getP2Fighter() { return p2Fighter; }
    public int getWinnerSlot() { return winnerSlot; }
    public String getReason() { return reason; }
    public int getP1Rounds() { return p1Rounds; }
    public int getP2Rounds() { return p2Rounds; }
    public int getP1EloBefore() { return p1EloBefore; }
    public int getP1EloAfter() { return p1EloAfter; }
    public int getP2EloBefore() { return p2EloBefore; }
    public int getP2EloAfter() { return p2EloAfter; }
    public long getDurationTicks() { return durationTicks; }
    public Instant getPlayedAt() { return playedAt; }
}
