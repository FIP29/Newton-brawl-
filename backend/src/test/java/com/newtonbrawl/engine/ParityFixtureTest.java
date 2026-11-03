package com.newtonbrawl.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Arena;
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
    static final int TICKS = 2400;
    static final int CHECKPOINT_EVERY = 20;
    static final MatchRules RULES = MatchRules.STANDARD.withCountdown(30).withRoundTime(900);

    @Test
    void fixtureMatchesCurrentEngine() throws Exception {
        FighterCatalog catalog = FighterCatalog.loadFromClasspath();
        MatchSimulation sim = new MatchSimulation(Arena.THE_LAB, catalog.create("prototype"), catalog.create("prototype"), RULES);
        Random rng = new Random(1905); // annus mirabilis
        Bot[] bots = {new Bot(rng), new Bot(rng)};

        List<int[]> inputs = new ArrayList<>(TICKS);
        Map<String, MatchSnapshot> checkpoints = new LinkedHashMap<>();
        for (int t = 1; t <= TICKS; t++) {
            MatchSnapshot before = sim.snapshot();
            InputFrame a = bots[0].next(before, 0), b = bots[1].next(before, 1);
            inputs.add(new int[] {a.held(), a.pressed(), b.held(), b.pressed()});
            sim.step(a, b);
            MatchSnapshot s = sim.snapshot();
            if (t % CHECKPOINT_EVERY == 0 || !s.events().isEmpty() || sim.phase() == MatchPhase.FINISHED) {
                checkpoints.put(Long.toString(s.tick()), s);
            }
            if (sim.phase() == MatchPhase.FINISHED) break;
        }

        Map<String, Object> fixture = new LinkedHashMap<>();
        fixture.put("arena", Arena.THE_LAB);
        fixture.put("rules", RULES);
        fixture.put("fighters", List.of("prototype", "prototype"));
        fixture.put("inputs", inputs);
        fixture.put("checkpoints", checkpoints);

        ObjectMapper mapper = new ObjectMapper().disable(SerializationFeature.INDENT_OUTPUT);
        String json = mapper.writeValueAsString(fixture) + "\n";

        // Sanity: the script must actually exercise hits and multiple rounds.
        assertThat(checkpoints.values().stream().anyMatch(s -> !s.events().isEmpty())).isTrue();
        assertThat(sim.round()).isGreaterThanOrEqualTo(2);

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
            InputFrame f = new InputFrame(bits, bits & ~prev);
            prev = bits;
            return f;
        }
    }
}
