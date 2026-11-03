package com.newtonbrawl.codex;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A Codex entry a player has unlocked. */
@Entity
@Table(name = "player_codex")
public class CodexUnlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "player_id", nullable = false) private long playerId;
    @Column(name = "entry_id", nullable = false, length = 64) private String entryId;
    @Column(name = "unlocked_at", nullable = false) private Instant unlockedAt;

    protected CodexUnlock() {}

    public CodexUnlock(long playerId, String entryId) {
        this.playerId = playerId;
        this.entryId = entryId;
        this.unlockedAt = Instant.now();
    }

    public String getEntryId() { return entryId; }
    public Instant getUnlockedAt() { return unlockedAt; }
}
