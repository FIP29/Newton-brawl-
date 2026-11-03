package com.newtonbrawl.unlock;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "player_unlocks")
public class PlayerUnlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "player_id", nullable = false) private long playerId;
    @Column(name = "unlock_id", nullable = false, length = 64) private String unlockId;
    @Column(name = "unlocked_at", nullable = false) private Instant unlockedAt;

    protected PlayerUnlock() {}

    public PlayerUnlock(long playerId, String unlockId) {
        this.playerId = playerId;
        this.unlockId = unlockId;
        this.unlockedAt = Instant.now();
    }

    public String getUnlockId() { return unlockId; }
}
