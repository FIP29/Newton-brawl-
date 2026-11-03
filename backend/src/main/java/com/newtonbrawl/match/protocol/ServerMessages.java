package com.newtonbrawl.match.protocol;

import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.HitEvent;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchResult;

import java.util.List;

/**
 * Every message the server sends over the match WebSocket. Each carries a short type tag {@code t}.
 * {@code frontend/src/game/protocol.ts} mirrors these shapes.
 */
public final class ServerMessages {
    private ServerMessages() {}

    /** Public info about someone in a room. */
    public record PlayerInfo(int slot, long id, String username, String displayName, int elo, boolean connected) {}

    public record ArenaInfo(String id, double width, double gravity) {}

    /** First message after joining: which slot you are and who's here. */
    public record Welcome(String t, String room, int slot, List<PlayerInfo> players) {
        public Welcome(String room, int slot, List<PlayerInfo> players) { this("welcome", room, slot, players); }
    }

    /** Room membership/connection changed. */
    public record Lobby(String t, List<PlayerInfo> players) {
        public Lobby(List<PlayerInfo> players) { this("lobby", players); }
    }

    /** Both players present: everything the client needs to render the match. */
    public record Start(String t, String matchId, int tickRate, int countdownTicks, ArenaInfo arena,
                        List<PlayerInfo> players, List<FighterDefinition> fighters) {
        public Start(String matchId, int tickRate, int countdownTicks, ArenaInfo arena,
                     List<PlayerInfo> players, List<FighterDefinition> fighters) {
            this("start", matchId, tickRate, countdownTicks, arena, players, fighters);
        }
    }

    /** Authoritative snapshot, sent every tick. {@code ack[slot]} = last input seq applied for that slot. */
    public record State(String t, long tick, MatchPhase phase, int phaseTicks, int hitstop,
                        List<FighterView> fighters, List<HitEvent> events, long[] ack) {
        public State(long tick, MatchPhase phase, int phaseTicks, int hitstop,
                     List<FighterView> fighters, List<HitEvent> events, long[] ack) {
            this("state", tick, phase, phaseTicks, hitstop, fighters, events, ack);
        }
    }

    public record End(String t, int winner, MatchResult.Reason reason, long ticks) {
        public End(MatchResult r) { this("end", r.winner(), r.reason(), r.ticks()); }
    }

    /** Echo of a client ping for round-trip measurement. */
    public record Pong(String t, double c, long tick) {
        public Pong(double c, long tick) { this("pong", c, tick); }
    }

    public record Error(String t, String code, String message) {
        public Error(String code, String message) { this("error", code, message); }
    }
}
