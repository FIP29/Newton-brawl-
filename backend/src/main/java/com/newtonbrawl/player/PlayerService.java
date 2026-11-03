package com.newtonbrawl.player;

import com.newtonbrawl.common.exception.NotFoundException;
import com.newtonbrawl.player.dto.PlayerProfileDto;
import com.newtonbrawl.history.MatchHistoryDto;
import com.newtonbrawl.history.MatchRecord;
import com.newtonbrawl.history.MatchRecordRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlayerService {

    /** Matches and wins with one fighter. */
    public record FighterStats(String fighter, int matches, int wins) {}

    private final PlayerRepository players;
    private final MatchRecordRepository history;

    public PlayerService(PlayerRepository players, MatchRecordRepository history) {
        this.players = players;
        this.history = history;
    }

    /** Most recent matches, newest first, from this player's point of view. */
    @Transactional(readOnly = true)
    public List<MatchHistoryDto> recentMatches(long playerId, int limit) {
        List<MatchRecord> recent = history.findRecent(playerId, PageRequest.of(0, Math.max(1, Math.min(limit, 50))));
        Map<Long, String> names = new HashMap<>();
        List<MatchHistoryDto> out = new ArrayList<>();
        for (MatchRecord m : recent) {
            int slot = m.slotOf(playerId);
            long oppId = slot == 0 ? m.getP2Id() : m.getP1Id();
            String oppName = names.computeIfAbsent(oppId, id -> players.findById(id).map(Player::getDisplayName).orElse("?"));
            String result = m.getWinnerSlot() < 0 ? "DRAW" : m.getWinnerSlot() == slot ? "WIN" : "LOSS";
            out.add(new MatchHistoryDto(m.getId(), m.getMode(), m.getPlayedAt(),
                slot == 0 ? m.getP1Fighter() : m.getP2Fighter(), slot == 0 ? m.getP2Fighter() : m.getP1Fighter(),
                oppId, oppName, result, slot == 0 ? m.getP1Rounds() : m.getP2Rounds(), slot == 0 ? m.getP2Rounds() : m.getP1Rounds(),
                slot == 0 ? m.getP1EloBefore() : m.getP2EloBefore(), slot == 0 ? m.getP1EloAfter() : m.getP2EloAfter(), m.getReason()));
        }
        return out;
    }

    /** Per-fighter usage, most played first. */
    @Transactional(readOnly = true)
    public List<FighterStats> fighterStats(long playerId) {
        Map<String, int[]> acc = new TreeMap<>();
        for (MatchRecord m : history.findAllForPlayer(playerId)) {
            int slot = m.slotOf(playerId);
            int[] a = acc.computeIfAbsent(slot == 0 ? m.getP1Fighter() : m.getP2Fighter(), f -> new int[2]);
            a[0]++;
            if (m.getWinnerSlot() == slot) a[1]++;
        }
        return acc.entrySet().stream().map(e -> new FighterStats(e.getKey(), e.getValue()[0], e.getValue()[1]))
            .sorted((x, y) -> Integer.compare(y.matches(), x.matches())).toList();
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
