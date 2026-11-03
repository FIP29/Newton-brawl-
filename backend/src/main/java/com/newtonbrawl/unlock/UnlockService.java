package com.newtonbrawl.unlock;

import com.newtonbrawl.codex.CodexService;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.history.MatchRecordRepository;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Fighter and skin unlocks. The four starters are always available; everything else is earned by
 * playing matches, winning and filling the Science Codex. Progress is evaluated after every match.
 */
@Service
public class UnlockService {

    public static final String CLASSIC_SKIN = "classic";

    private final UnlockCatalog catalog;
    private final PlayerUnlockRepository owned;
    private final MatchRecordRepository matches;
    private final PlayerRepository players;
    private final CodexService codex;
    private final FighterCatalog fighters;

    public UnlockService(UnlockCatalog catalog, PlayerUnlockRepository owned, MatchRecordRepository matches,
                         PlayerRepository players, CodexService codex, FighterCatalog fighters) {
        this.catalog = catalog;
        this.owned = owned;
        this.matches = matches;
        this.players = players;
        this.codex = codex;
        this.fighters = fighters;
    }

    /** May this player pick this fighter (and skin)? */
    @Transactional(readOnly = true)
    public boolean canUse(long playerId, String fighterId, String skin) {
        if (!isImplemented(fighterId)) return false;
        Set<String> have = ownedIds(playerId);
        boolean fighterOk = FighterCatalog.PLAYABLE.contains(fighterId)
            || catalog.fighter(fighterId).map(u -> have.contains(u.id())).orElse(false);
        if (!fighterOk) return false;
        if (skin == null || skin.isBlank() || CLASSIC_SKIN.equals(skin)) return true;
        return catalog.skin(fighterId, skin).map(u -> have.contains(u.id())).orElse(false);
    }

    /** Fighters this player may pick right now, with their unlocked skins. */
    @Transactional(readOnly = true)
    public Map<String, List<String>> usable(long playerId) {
        Set<String> have = ownedIds(playerId);
        Map<String, List<String>> out = new java.util.LinkedHashMap<>();
        for (String id : FighterCatalog.PLAYABLE) out.put(id, new ArrayList<>(List.of(CLASSIC_SKIN)));
        for (UnlockCatalog.Unlock u : catalog.all()) {
            if (!have.contains(u.id()) || !isImplemented(u.fighter())) continue;
            if (u.type() == UnlockCatalog.Type.FIGHTER) out.putIfAbsent(u.fighter(), new ArrayList<>(List.of(CLASSIC_SKIN)));
        }
        for (UnlockCatalog.Unlock u : catalog.all()) {
            if (u.type() == UnlockCatalog.Type.SKIN && have.contains(u.id()) && out.containsKey(u.fighter())) out.get(u.fighter()).add(u.skin());
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<UnlockDtos.UnlockStatus> statusFor(long playerId) {
        Stats stats = stats(playerId);
        Set<String> have = ownedIds(playerId);
        List<UnlockDtos.UnlockStatus> out = new ArrayList<>();
        for (UnlockCatalog.Unlock u : catalog.all()) {
            int progress = progress(u.requirement(), stats);
            out.add(new UnlockDtos.UnlockStatus(u.id(), u.type(), u.fighter(), u.skin(), u.name(), describe(u.requirement()),
                Math.min(progress, u.requirement().count()), u.requirement().count(), have.contains(u.id()), isImplemented(u.fighter())));
        }
        return out;
    }

    /** Grants every unlock whose requirement is now met. Returns the new ones. */
    @Transactional
    public List<UnlockDtos.UnlockRef> evaluate(long playerId) {
        Stats stats = stats(playerId);
        Set<String> have = new HashSet<>(ownedIds(playerId));
        List<UnlockDtos.UnlockRef> fresh = new ArrayList<>();
        for (UnlockCatalog.Unlock u : catalog.all()) {
            if (have.contains(u.id()) || progress(u.requirement(), stats) < u.requirement().count()) continue;
            owned.save(new PlayerUnlock(playerId, u.id()));
            have.add(u.id());
            fresh.add(new UnlockDtos.UnlockRef(u.id(), u.name(), u.type(), u.fighter(), u.skin(), isImplemented(u.fighter())));
        }
        return fresh;
    }

    private record Stats(long matches, int wins, long codexEntries, Map<String, Long> winsWith) {}

    private Stats stats(long playerId) {
        Player p = players.findById(playerId).orElseThrow();
        Map<String, Long> winsWith = new HashMap<>();
        for (UnlockCatalog.Unlock u : catalog.all()) {
            if (u.requirement().type() == UnlockCatalog.RequirementType.WINS_WITH) {
                winsWith.computeIfAbsent(u.requirement().fighter(), f -> matches.countWinsWith(playerId, f));
            }
        }
        return new Stats(matches.countForPlayer(playerId), p.getWins(), codex.count(playerId), winsWith);
    }

    private static int progress(UnlockCatalog.Requirement r, Stats s) {
        long v = switch (r.type()) {
            case MATCHES_PLAYED -> s.matches();
            case WINS -> s.wins();
            case CODEX_ENTRIES -> s.codexEntries();
            case WINS_WITH -> s.winsWith().getOrDefault(r.fighter(), 0L);
        };
        return (int) Math.min(Integer.MAX_VALUE, v);
    }

    private static String describe(UnlockCatalog.Requirement r) {
        return switch (r.type()) {
            case MATCHES_PLAYED -> "Play " + r.count() + " matches";
            case WINS -> "Win " + r.count() + " matches";
            case CODEX_ENTRIES -> "Unlock " + r.count() + " Codex entries";
            case WINS_WITH -> "Win " + r.count() + " matches as " + capitalise(r.fighter());
        };
    }

    private static String capitalise(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private Set<String> ownedIds(long playerId) {
        return owned.findByPlayerId(playerId).stream().map(PlayerUnlock::getUnlockId).collect(Collectors.toSet());
    }

    private boolean isImplemented(String fighterId) {
        try {
            fighters.definition(fighterId);
            return !"prototype".equals(fighterId);
        } catch (RuntimeException e) {
            return false;
        }
    }
}
