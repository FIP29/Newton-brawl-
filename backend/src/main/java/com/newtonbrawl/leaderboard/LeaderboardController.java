package com.newtonbrawl.leaderboard;

import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import com.newtonbrawl.security.AuthenticatedPlayer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/** Ranked ladder: everyone with at least one ranked game, highest Elo first. */
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    public record Entry(int rank, long playerId, String username, String displayName, int elo, String tier,
                        String tierName, int wins, int losses, int rankedGames) {}

    /** @param me the caller's own row (even if not on this page), or null if unranked */
    public record Board(int page, int size, long totalPlayers, List<Entry> entries, Entry me) {}

    private final PlayerRepository players;

    public LeaderboardController(PlayerRepository players) {
        this.players = players;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Board board(@AuthenticationPrincipal AuthenticatedPlayer me,
                       @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        int s = Math.max(1, Math.min(100, size)), pg = Math.max(0, page);
        Page<Player> result = players.findByRankedGamesGreaterThanOrderByEloDescIdAsc(0, PageRequest.of(pg, s));
        List<Entry> entries = new ArrayList<>();
        int rank = pg * s + 1;
        for (Player p : result.getContent()) entries.add(entry(rank++, p));
        Entry mine = players.findById(me.id())
            .filter(p -> p.getRankedGames() > 0)
            .map(p -> entry((int) players.countRankedAbove(p.getElo(), p.getId()) + 1, p))
            .orElse(null);
        return new Board(pg, s, result.getTotalElements(), entries, mine);
    }

    private static Entry entry(int rank, Player p) {
        return new Entry(rank, p.getId(), p.getUsername(), p.getDisplayName(), p.getElo(), p.rankTier().name(),
            p.rankTier().displayName(), p.getWins(), p.getLosses(), p.getRankedGames());
    }
}
