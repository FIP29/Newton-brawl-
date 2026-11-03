package com.newtonbrawl.player;

import com.newtonbrawl.common.exception.NotFoundException;
import com.newtonbrawl.player.dto.PlayerProfileDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlayerService {

    private final PlayerRepository players;

    public PlayerService(PlayerRepository players) {
        this.players = players;
    }

    @Transactional(readOnly = true)
    public PlayerProfileDto getProfile(long playerId) {
        return PlayerProfileDto.from(find(playerId));
    }

    @Transactional
    public PlayerProfileDto updateDisplayName(long playerId, String displayName) {
        Player p = find(playerId);
        p.setDisplayName(displayName.trim());
        return PlayerProfileDto.from(p);
    }

    private Player find(long id) {
        return players.findById(id).orElseThrow(() -> new NotFoundException("Player not found"));
    }
}
