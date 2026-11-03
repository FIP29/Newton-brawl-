package com.newtonbrawl.match.protocol;

import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.ObjectView;
import com.newtonbrawl.engine.sim.ProjectileView;
import com.newtonbrawl.engine.sim.ZoneView;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import com.newtonbrawl.engine.sim.RoundResult;

import java.util.List;

/**
 * Every message the server sends over the match WebSocket. Each carries a short type tag {@code t}.
 * {@code frontend/src/game/protocol.ts} mirrors these shapes.
 */
public final class ServerMessages {
    private ServerMessages() {}

    /** Public info about someone in a room. */
    /** @param fighter picked fighter id, or null while still choosing */
    public record PlayerInfo(int slot, long id, String username, String displayName, int elo, boolean connected,
                             String fighter) {}

    public record ArenaInfo(String id, double width, double height, double gravity, List<Double> objectSpawns) {}

    /** First message after joining: which slot you are, who's here, and who can be picked. */
    public record Welcome(String t, String room, int slot, List<PlayerInfo> players, List<FighterDefinition> roster) {
        public Welcome(String room, int slot, List<PlayerInfo> players, List<FighterDefinition> roster) {
            this("welcome", room, slot, players, roster);
        }
    }

    /** Room membership/connection changed. */
    public record Lobby(String t, List<PlayerInfo> players) {
        public Lobby(List<PlayerInfo> players) { this("lobby", players); }
    }

    /** Mirrors {@link com.newtonbrawl.engine.sim.MatchRules}. */
    public record RulesInfo(int countdownTicks, int roundTimeTicks, int roundsToWin, int maxRounds, int roundEndTicks) {}

    /** Both players present: everything the client needs to render (and predict) the match. */
    public record Start(String t, String matchId, int tickRate, RulesInfo rules, ArenaInfo arena,
                        List<PlayerInfo> players, List<FighterDefinition> fighters) {
        public Start(String matchId, int tickRate, RulesInfo rules, ArenaInfo arena,
                     List<PlayerInfo> players, List<FighterDefinition> fighters) {
            this("start", matchId, tickRate, rules, arena, players, fighters);
        }
    }

    /** Authoritative snapshot, sent every tick. {@code ack[slot]} = last input seq applied for that slot. */
    public record State(String t, long tick, MatchPhase phase, int phaseTicks, int hitstop, int cinematic,
                        int round, List<Integer> roundWins, int timer, RoundResult lastRound,
                        List<FighterView> fighters, List<ProjectileView> projectiles, List<ZoneView> zones,
                        List<ObjectView> objects, List<GameEvent> events, long[] ack) {
        public State(MatchSnapshot s, long[] ack) {
            this("state", s.tick(), s.phase(), s.phaseTicks(), s.hitstop(), s.cinematic(), s.round(), s.roundWins(),
                s.timer(), s.lastRound(), s.fighters(), s.projectiles(), s.zones(), s.objects(), s.events(), ack);
        }
    }

    public record End(String t, int winner, MatchResult.Reason reason, long ticks, List<Integer> roundWins) {
        public End(MatchResult r) { this("end", r.winner(), r.reason(), r.ticks(), r.roundWins()); }
    }

    /** Echo of a client ping for round-trip measurement. */
    public record Pong(String t, double c, long tick) {
        public Pong(double c, long tick) { this("pong", c, tick); }
    }

    public record Error(String t, String code, String message) {
        public Error(String code, String message) { this("error", code, message); }
    }
}
