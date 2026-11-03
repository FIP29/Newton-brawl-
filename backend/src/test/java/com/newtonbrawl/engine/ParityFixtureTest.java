package com.newtonbrawl.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Keeps the TypeScript port of the simulation (frontend/src/game/sim) honest.
 *
 * <p>Plays a long scripted match (two aggressive bots, several rounds incl. KOs and a time-out) and
 * records every input plus periodic snapshots to {@code frontend/src/game/sim/__fixtures__/parity.json}.
 * The frontend test {@code parity.test.ts} replays the same inputs through the TS simulation and
 * must reproduce the snapshots exactly.
 *
 * <p>If engine behaviour changes, this test rewrites the fixture and fails once, as a reminder to
 * port the change to TypeScript and re-run {@code npm test}.
 */
class ParityFixtureTest {

    static final Path FIXTURE = Path.of("../frontend/src/game/sim/__fixtures__/parity.json");
    static final int TICKS = 2000;
    static final int CHECKPOINT_EVERY = 60;
    static final MatchRules RULES = MatchRules.STANDARD.withCountdown(30).withRoundTime(900);
    /** Matchups covering every special and ultimate, in both arenas: fighter A, fighter B, arena. */
    static final List<List<String>> MATCHUPS = List.of(
        List.of("newton", "tesla", "the-lab"), List.of("curie", "einstein", "the-lab"), List.of("tesla", "curie", "space-station"),
        List.of("einstein", "newton", "space-station"), List.of("galileo", "archimedes", "space-station"),
        List.of("faraday", "tesla", "the-lab"), List.of("hooke", "faraday", "space-station"), List.of("archimedes", "hooke", "the-lab"),
        List.of("galileo", "curie", "the-lab"),
        List.of("schrodinger", "heisenberg", "black-hole-edge"), List.of("hawking", "doppler", "black-hole-edge"),
        List.of("schrodinger", "newton", "the-lab"), List.of("heisenberg", "hawking", "space-station"),
        List.of("doppler", "schrodinger", "black-hole-edge"), List.of("hawking", "tesla", "black-hole-edge"),
        List.of("bernoulli", "edison", "curzon-hall"), List.of("sn-bose", "jc-bose", "curzon-hall"),
        List.of("edison", "tesla", "the-lab"), List.of("sn-bose", "einstein", "curzon-hall"),
        List.of("jc-bose", "faraday", "space-station"), List.of("curie", "heisenberg", "black-hole-edge"),
        List.of("galileo", "sn-bose", "curzon-hall"), List.of("edison", "jc-bose", "curzon-hall"));

    @Test
    void fixtureMatchesCurrentEngine() throws Exception {
        FighterCatalog catalog = FighterCatalog.loadFromClasspath();
        Random rng = new Random(1905); // annus mirabilis
        List<Map<String, Object>> matches = new ArrayList<>();
        java.util.Set<String> eventTypes = new java.util.TreeSet<>();
        java.util.Set<String> movesUsed = new java.util.TreeSet<>();

        for (List<String> pair : MATCHUPS) {
            Arena arena = Arena.byId(pair.get(2));
            MatchSimulation sim = new MatchSimulation(arena, catalog.create(pair.get(0)), catalog.create(pair.get(1)), RULES);
            Bot[] bots = {new Bot(rng), new Bot(rng)};
            // One int per tick: held0 | pressed0 << 8 | held1 << 16 | pressed1 << 24.
            List<Integer> inputs = new ArrayList<>(TICKS);
            Map<String, MatchSnapshot> checkpoints = new LinkedHashMap<>();
            for (int t = 1; t <= TICKS; t++) {
                MatchSnapshot before = sim.snapshot();
                InputFrame a = bots[0].next(before, 0), b = bots[1].next(before, 1);
                inputs.add(a.held() | a.pressed() << 8 | b.held() << 16 | b.pressed() << 24);
                sim.step(a, b);
                MatchSnapshot s = sim.snapshot();
                s.events().forEach(e -> { eventTypes.add(e.type()); if (e.move() != null && e.attacker() >= 0) movesUsed.add(pair.get(e.attacker()) + "." + e.move()); });
                // Any divergence propagates, so periodic checkpoints plus every hit-type event suffice.
                boolean keyEvent = s.events().stream().anyMatch(e -> !e.type().equals(GameEvent.CAST) && !e.type().equals(GameEvent.CLANK));
                if (t % CHECKPOINT_EVERY == 0 || keyEvent || sim.phase() == MatchPhase.FINISHED) {
                    checkpoints.put(Long.toString(s.tick()), s);
                }
                if (sim.phase() == MatchPhase.FINISHED) break;
            }
            Map<String, Object> match = new LinkedHashMap<>();
            match.put("arena", arena);
            match.put("rules", RULES);
            match.put("fighters", pair.subList(0, 2));
            match.put("inputs", inputs);
            match.put("checkpoints", checkpoints);
            matches.add(match);
        }

        ObjectMapper mapper = new ObjectMapper().disable(SerializationFeature.INDENT_OUTPUT);
        String json = mapper.writeValueAsString(Map.of("matches", matches)) + "\n";

        // Sanity: the bots must actually exercise the interesting mechanics.
        assertThat(eventTypes).contains(GameEvent.HIT, GameEvent.CAST, GameEvent.ULTIMATE, GameEvent.CLANK,
            GameEvent.COLLAPSE, GameEvent.SWALLOW, GameEvent.PHASE, GameEvent.FREEZE, GameEvent.CONDENSE, GameEvent.COPY);
        for (String f : List.of("newton", "tesla", "curie", "einstein", "galileo", "archimedes", "faraday", "hooke",
                "schrodinger", "heisenberg", "hawking", "doppler", "bernoulli", "edison", "sn-bose", "jc-bose")) {
            assertThat(movesUsed).contains(f + ".special1", f + ".special2", f + ".ultimate");
        }

        String existing = Files.exists(FIXTURE) ? Files.readString(FIXTURE) : "";
        if (!existing.equals(json)) {
            Files.createDirectories(FIXTURE.getParent());
            Files.writeString(FIXTURE, json);
            assertThat(existing)
                .as("Parity fixture was out of date and has been regenerated: port the engine change to "
                    + "frontend/src/game/sim, run `npm test` in /frontend, and commit the new fixture.")
                .isEqualTo(json);
        }
    }

    /** A simple aggressive bot: walk at the opponent, jump now and then, mash attacks in range. */
    static final class Bot {
        private final Random rng;
        private int prev;
        private int jumpCooldown;

        Bot(Random rng) { this.rng = rng; }

        InputFrame next(MatchSnapshot s, int slot) {
            var me = s.fighters().get(slot);
            var them = s.fighters().get(1 - slot);
            double dx = them.x() - me.x();
            int bits = 0;
            double roll = rng.nextDouble();
            if (Math.abs(dx) > 150 || roll < 0.15) bits |= dx > 0 ? InputBits.RIGHT : InputBits.LEFT;
            else if (roll < 0.25) bits |= dx > 0 ? InputBits.LEFT : InputBits.RIGHT; // back off
            if (--jumpCooldown <= 0 && rng.nextDouble() < 0.02) { bits |= InputBits.UP; jumpCooldown = 40; }
            if (rng.nextDouble() < 0.03) bits |= InputBits.DOWN;
            if (Math.abs(dx) < 220) {
                double a = rng.nextDouble();
                if (a < 0.08) bits |= InputBits.LIGHT;
                else if (a < 0.12) bits |= InputBits.HEAVY;
            }
            double sp = rng.nextDouble();
            if (sp < 0.02) bits |= InputBits.SPECIAL;
            else if (sp < 0.035) bits |= InputBits.SPECIAL | InputBits.DOWN;
            if (me.energy() >= EngineConstants.ENERGY_MAX && rng.nextDouble() < 0.05) bits |= InputBits.ULTIMATE;
            InputFrame f = new InputFrame(bits, bits & ~prev);
            prev = bits;
            return f;
        }
    }
}
