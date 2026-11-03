package com.newtonbrawl.match;

import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persists match outcomes. Elo and match history arrive in Phase 5. */
@Service
public class MatchResultService {

    private final PlayerRepository players;

    public MatchResultService(PlayerRepository players) {
        this.players = players;
    }

    @Transactional
    public void recordWin(long winnerId, long loserId) {
        players.findById(winnerId).ifPresent(Player::recordWin);
        players.findById(loserId).ifPresent(Player::recordLoss);
    }
}
