package com.newtonbrawl.engine.balance;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterClass;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Action;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.FighterState;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Balance tooling: a round-robin league of bot-vs-bot matches between every pair of fighters, on
 * both sides and in every arena. The bot is simple but plays each class's game plan (zoners keep
 * their distance, everyone uses specials off cooldown and ultimates when the meter is full), so a
 * fighter that wins far more or less than half its games is a balance outlier worth a look.
 *
 * <p>Bots aren't people: the numbers flag outliers, they don't prove a matchup is fair.
 */
public final class BalanceLeague {

    public record Game(String a, String b, String arena, int winner, long ticks) {}

    /** Win counts per fighter plus the full head-to-head matrix. */
    public record Report(List<String> fighters, Map<String, int[]> record, Map<String, Map<String, int[]>> h2h,
                         double avgSeconds, int games) {
        public double winRate(String f) {
            int[] r = record.get(f);
            return r[1] == 0 ? 0 : (double) r[0] / r[1];
        }
    }

    /** Plays a class-aware game plan with a little randomness. */
    static final class Bot {
        private final Random rng;
        private int prev;

        Bot(long seed) { rng = new Random(seed); }

        InputFrame next(MatchSimulation sim, int slot) {
            if (sim.phase() != MatchPhase.FIGHTING) return release();
            FighterState me = sim.fighter(slot), op = sim.fighter(1 - slot);
            double dx = op.x() - me.x(), dist = Math.abs(dx);
            int toward = dx > 0 ? InputBits.RIGHT : InputBits.LEFT, away = dx > 0 ? InputBits.LEFT : InputBits.RIGHT;
            FighterClass cls = me.definition().fighterClass();
            double ideal = switch (cls) {
                case ZONER -> 430;
                case TRICKSTER -> 210;
                default -> 110;
            };
            int bits = 0;
            if (dist > ideal + 60) bits |= toward;
            else if (dist < ideal - 90) bits |= away;
            else if (rng.nextDouble() < 0.2) bits |= rng.nextBoolean() ? toward : away;
            if (me.grounded() && rng.nextDouble() < 0.012) bits |= InputBits.UP;

            Action a = me.action();
            boolean free = a == Action.IDLE || a == Action.WALK || a == Action.CROUCH || a == Action.AIRBORNE;
            if (free) {
                double roll = rng.nextDouble();
                if (me.energy() >= EngineConstants.ENERGY_MAX && roll < 0.08) bits |= InputBits.ULTIMATE;
                else if (me.cooldown(0) == 0 && roll < 0.04) bits |= InputBits.SPECIAL;
                else if (me.cooldown(1) == 0 && roll < 0.07) bits |= InputBits.SPECIAL | InputBits.DOWN;
                else if (dist < 170 && roll < 0.32) bits |= rng.nextDouble() < 0.7 ? InputBits.LIGHT : InputBits.HEAVY;
            }
            InputFrame f = new InputFrame(bits, bits & ~prev);
            prev = bits;
            return f;
        }

        private InputFrame release() {
            prev = 0;
            return InputFrame.NONE;
        }
    }

    public static Game play(FighterCatalog catalog, String a, String b, Arena arena, long seed) {
        MatchSimulation sim = new MatchSimulation(arena, catalog.create(a), catalog.create(b), MatchRules.STANDARD.withCountdown(0));
        Bot b0 = new Bot(seed * 31 + 1), b1 = new Bot(seed * 31 + 2);
        int guard = 0;
        while (sim.phase() != MatchPhase.FINISHED && guard++ < 60 * 60 * 10) sim.step(b0.next(sim, 0), b1.next(sim, 1));
        int winner = sim.result() == null ? -1 : sim.result().winner();
        return new Game(a, b, arena.id(), winner, sim.tick());
    }

    /** Every pair, both sides, every arena, {@code repeats} times. */
    public static Report run(FighterCatalog catalog, List<String> fighters, List<Arena> arenas, int repeats) {
        Map<String, int[]> record = new LinkedHashMap<>();
        Map<String, Map<String, int[]>> h2h = new LinkedHashMap<>();
        for (String f : fighters) {
            record.put(f, new int[2]);
            Map<String, int[]> row = new LinkedHashMap<>();
            for (String g : fighters) row.put(g, new int[2]);
            h2h.put(f, row);
        }
        long seed = 1687; // Principia
        long ticks = 0;
        int games = 0;
        for (int i = 0; i < fighters.size(); i++) {
            for (int j = i + 1; j < fighters.size(); j++) {
                for (Arena arena : arenas) {
                    for (int r = 0; r < repeats; r++) {
                        for (int side = 0; side < 2; side++) {
                            String a = fighters.get(side == 0 ? i : j), b = fighters.get(side == 0 ? j : i);
                            Game g = play(catalog, a, b, arena, seed++);
                            ticks += g.ticks();
                            games++;
                            tally(record, h2h, a, b, g.winner() == 0 ? 1.0 : g.winner() == 1 ? 0.0 : 0.5);
                        }
                    }
                }
            }
        }
        return new Report(fighters, record, h2h, (double) ticks / games / EngineConstants.TICK_RATE, games);
    }

    /** Records a game; a draw counts as half a win for each side (stored in half-wins). */
    private static void tally(Map<String, int[]> record, Map<String, Map<String, int[]>> h2h, String a, String b, double scoreA) {
        int halfA = (int) Math.round(scoreA * 2), halfB = 2 - halfA;
        record.get(a)[0] += halfA; record.get(a)[1] += 2;
        record.get(b)[0] += halfB; record.get(b)[1] += 2;
        h2h.get(a).get(b)[0] += halfA; h2h.get(a).get(b)[1] += 2;
        h2h.get(b).get(a)[0] += halfB; h2h.get(b).get(a)[1] += 2;
    }

    /** The report as Markdown: overall win rates, then the head-to-head matrix. */
    public static String markdown(Report r) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Balance report\n\n");
        sb.append(String.format(Locale.ROOT, "Generated by `BalanceLeague`: %d bot-vs-bot matches (every pair, both sides, all %d arenas). "
            + "Average match length %.1f s.%n%n", r.games(), Arena.ALL.size(), r.avgSeconds()));
        sb.append("Bots play a simple class-aware plan, so treat this as a tool for spotting outliers, not a verdict on any matchup.\n\n");
        sb.append("| Fighter | Win rate |\n|---|---:|\n");
        List<String> sorted = new ArrayList<>(r.fighters());
        sorted.sort((x, y) -> Double.compare(r.winRate(y), r.winRate(x)));
        for (String f : sorted) sb.append(String.format(Locale.ROOT, "| %s | %.0f%% |%n", f, r.winRate(f) * 100));
        sb.append("\n### Head to head (row's win rate against column)\n\n|  |");
        for (String f : r.fighters()) sb.append(' ').append(abbrev(f)).append(" |");
        sb.append("\n|---|");
        r.fighters().forEach(f -> sb.append("---:|"));
        sb.append('\n');
        for (String f : r.fighters()) {
            sb.append("| ").append(f).append(" |");
            for (String g : r.fighters()) {
                int[] c = r.h2h().get(f).get(g);
                sb.append(f.equals(g) ? " – |" : String.format(Locale.ROOT, " %.0f |", c[1] == 0 ? 0 : 100.0 * c[0] / c[1]));
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    private static String abbrev(String id) {
        return id.length() <= 4 ? id : id.substring(0, 4);
    }

    /** Roster in catalogue order, without the test dummy. */
    public static List<String> roster(FighterCatalog catalog) {
        List<String> ids = new ArrayList<>();
        catalog.all().forEach(d -> { if (!d.id().equals("prototype")) ids.add(d.id()); });
        return ids;
    }
}
