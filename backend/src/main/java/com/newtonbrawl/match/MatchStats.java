package com.newtonbrawl.match;

import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.fighter.MoveKind;
import com.newtonbrawl.engine.sim.GameEvent;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-match statistics gathered from simulation events on the match thread: which specials each
 * player landed (and how often), and which they were hit by. Drives Codex unlocks and Lab Notes.
 */
public final class MatchStats {

    private final FighterDefinition[] defs;
    @SuppressWarnings("unchecked")
    private final Map<String, Integer>[] landed = new Map[] {new LinkedHashMap<>(), new LinkedHashMap<>()};
    @SuppressWarnings("unchecked")
    private final Map<String, Integer>[] suffered = new Map[] {new LinkedHashMap<>(), new LinkedHashMap<>()};

    public MatchStats(FighterDefinition p1, FighterDefinition p2) {
        this.defs = new FighterDefinition[] {p1, p2};
    }

    public void onEvents(List<GameEvent> events) {
        for (GameEvent e : events) {
            if (e.attacker() < 0 || e.attacker() > 1 || e.move() == null) continue;
            int a = e.attacker();
            switch (e.type()) {
                case GameEvent.HIT -> { if (isSpecial(a, e.move())) count(a, e.move()); }
                // Third Law reflection counts as Newton's ultimate landing.
                case GameEvent.REFLECT -> { if (defs[a].move("ultimate") != null) count(a, "ultimate"); }
                // Specials that never deal damage (dash, bubble, pull…) count when cast.
                case GameEvent.CAST -> {
                    MoveDefinition m = defs[a].move(e.move());
                    if (m != null && m.kind() != MoveKind.NORMAL && m.damage() == 0) count(a, e.move());
                }
                default -> { }
            }
        }
    }

    private boolean isSpecial(int slot, String move) {
        MoveDefinition m = defs[slot].move(move);
        return m != null && m.kind() != MoveKind.NORMAL;
    }

    private synchronized void count(int slot, String move) {
        landed[slot].merge(move, 1, Integer::sum);
        suffered[1 - slot].merge(move, 1, Integer::sum);
    }

    /** Moves this slot landed → count. */
    public synchronized Map<String, Integer> landed(int slot) { return Map.copyOf(landed[slot]); }

    /** Opponent moves this slot was hit by → count. */
    public synchronized Map<String, Integer> suffered(int slot) { return Map.copyOf(suffered[slot]); }

    public String fighter(int slot) { return defs[slot].id(); }
}
