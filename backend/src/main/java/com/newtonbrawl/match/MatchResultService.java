package com.newtonbrawl.match;

import com.newtonbrawl.codex.CodexDtos;
import com.newtonbrawl.codex.CodexService;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.history.MatchRecord;
import com.newtonbrawl.history.MatchRecordRepository;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import com.newtonbrawl.player.RankTier;
import com.newtonbrawl.ranked.Elo;
import com.newtonbrawl.unlock.UnlockService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Persists a finished match and works out each player's rewards, in one transaction:
 * record + win/loss, Elo (ranked only), match history row, Codex entries, unlocks, Lab Note.
 */
@Service
public class MatchResultService {

    /** Everything known about a finished match. */
    public record Summary(MatchMode mode, long[] playerIds, MatchResult result, MatchStats stats) {}

    private final PlayerRepository players;
    private final MatchRecordRepository history;
    private final CodexService codex;
    private final UnlockService unlocks;

    public MatchResultService(PlayerRepository players, MatchRecordRepository history, CodexService codex, UnlockService unlocks) {
        this.players = players;
        this.history = history;
        this.codex = codex;
        this.unlocks = unlocks;
    }

    @Transactional
    public MatchReward[] record(Summary s) {
        Player[] p = {players.findById(s.playerIds()[0]).orElseThrow(), players.findById(s.playerIds()[1]).orElseThrow()};
        MatchResult r = s.result();
        int[] before = {p[0].getElo(), p[1].getElo()};
        RankTier[] tierBefore = {p[0].rankTier(), p[1].rankTier()};

        if (r.winner() >= 0) {
            p[r.winner()].recordWin();
            p[1 - r.winner()].recordLoss();
        }
        if (s.mode() == MatchMode.RANKED) {
            double score0 = r.winner() == 0 ? 1 : r.winner() == 1 ? 0 : 0.5;
            int after0 = Elo.update(before[0], before[1], score0, Elo.kFactor(p[0].getRankedGames()));
            int after1 = Elo.update(before[1], before[0], 1 - score0, Elo.kFactor(p[1].getRankedGames()));
            p[0].applyRanked(after0);
            p[1].applyRanked(after1);
        }

        history.save(new MatchRecord(s.mode(), p[0].getId(), p[1].getId(), s.stats().fighter(0), s.stats().fighter(1),
            r.winner(), r.reason().name(), r.roundWins().get(0), r.roundWins().get(1),
            before[0], p[0].getElo(), before[1], p[1].getElo(), r.ticks()));

        MatchReward[] rewards = new MatchReward[2];
        for (int slot = 0; slot < 2; slot++) {
            List<CodexDtos.EntryRef> newCodex = codex.unlock(p[slot].getId(), codexEntries(s.stats(), slot));
            var newUnlocks = unlocks.evaluate(p[slot].getId());
            rewards[slot] = new MatchReward(s.mode(), before[slot], p[slot].getElo(), tierBefore[slot].name(),
                p[slot].rankTier().name(), p[slot].rankTier().displayName(), newCodex, newUnlocks, labNote(s.stats(), slot));
        }
        return rewards;
    }

    /**
     * Codex entries a player discovers in a match: both fighters' pages (you met them), plus every
     * special you landed and every special that hit you.
     */
    static Set<String> codexEntries(MatchStats stats, int slot) {
        Set<String> ids = new LinkedHashSet<>();
        String mine = stats.fighter(slot), theirs = stats.fighter(1 - slot);
        ids.add(mine);
        ids.add(theirs);
        stats.landed(slot).keySet().forEach(m -> ids.add(mine + "." + m));
        stats.suffered(slot).keySet().forEach(m -> ids.add(theirs + "." + m));
        return ids;
    }

    /** The move you used most; else the one that hit you most; else your fighter's first special. */
    private CodexDtos.LabNote labNote(MatchStats stats, int slot) {
        String mine = stats.fighter(slot), theirs = stats.fighter(1 - slot);
        List<String[]> candidates = new ArrayList<>();
        mostUsed(stats.landed(slot)).forEach(m -> candidates.add(new String[] {mine, m}));
        mostUsed(stats.suffered(slot)).forEach(m -> candidates.add(new String[] {theirs, m}));
        candidates.add(new String[] {mine, "special1"});
        for (String[] c : candidates) {
            if (codex.hasLabNote(c[0], c[1])) return codex.labNote(c[0], c[1]);
        }
        return null;
    }

    private static List<String> mostUsed(Map<String, Integer> counts) {
        return counts.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue(Comparator.reverseOrder()).thenComparing(Map.Entry.comparingByKey()))
            .map(Map.Entry::getKey).toList();
    }
}
