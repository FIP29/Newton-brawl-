package com.newtonbrawl.engine;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.PrototypeFighter;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Action;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class MatchSimulationTest {

    private static final FighterCatalog CATALOG = FighterCatalog.loadFromClasspath();
    private static final FighterDefinition PROTO = CATALOG.definition(PrototypeFighter.ID);
    private static final InputFrame NONE = InputFrame.NONE;

    private static MatchSimulation newSim() {
        return new MatchSimulation(Arena.THE_LAB, CATALOG.create("prototype"), CATALOG.create("prototype"), 0);
    }

    private static InputFrame hold(int bits) { return new InputFrame(bits, 0); }
    private static InputFrame press(int bits) { return new InputFrame(bits, bits); }

    private static void idle(MatchSimulation sim, int ticks) {
        for (int i = 0; i < ticks; i++) sim.step(NONE, NONE);
    }

    private static FighterView view(MatchSimulation sim, int slot) {
        return sim.snapshot().fighters().get(slot);
    }

    @Test
    void countdownBlocksInputThenFightBegins() {
        var sim = new MatchSimulation(Arena.THE_LAB, CATALOG.create("prototype"), CATALOG.create("prototype"), 10);
        double x0 = view(sim, 0).x();
        for (int i = 0; i < 9; i++) sim.step(hold(InputBits.RIGHT), NONE);
        assertThat(sim.phase()).isEqualTo(MatchPhase.COUNTDOWN);
        assertThat(view(sim, 0).x()).isEqualTo(x0);
        sim.step(hold(InputBits.RIGHT), NONE);
        assertThat(sim.phase()).isEqualTo(MatchPhase.FIGHTING);
        sim.step(hold(InputBits.RIGHT), NONE);
        assertThat(view(sim, 0).x()).isGreaterThan(x0);
    }

    @Test
    void walkingMovesAtWalkSpeed() {
        var sim = newSim();
        double x0 = view(sim, 0).x();
        for (int i = 0; i < 60; i++) sim.step(hold(InputBits.LEFT), NONE); // away from P2
        // one second of walking ≈ walkSpeed units
        assertThat(x0 - view(sim, 0).x()).isCloseTo(PROTO.walkSpeed(), within(1.0));
        assertThat(view(sim, 0).action()).isEqualTo(Action.WALK);
    }

    @Test
    void jumpFollowsProjectileMotionAndLands() {
        var sim = newSim();
        sim.step(hold(InputBits.UP), NONE);
        double apex = 0;
        int airborneTicks = 0;
        for (int i = 0; i < 200 && !view(sim, 0).grounded(); i++) {
            sim.step(NONE, NONE);
            apex = Math.max(apex, view(sim, 0).y());
            airborneTicks++;
        }
        // Continuous: h = v²/2g, t = 2v/g. Semi-implicit Euler at 60 Hz lands at h ≈ v²/2g − v·Δt/2.
        double v = PROTO.jumpVelocity(), g = Arena.THE_LAB.gravity();
        assertThat(apex).isCloseTo(v * v / (2 * g) - v * EngineConstants.DT / 2, within(1.5));
        assertThat(airborneTicks / 60.0).isCloseTo(2 * v / g, within(0.05));
        assertThat(view(sim, 0).y()).isZero();
        assertThat(view(sim, 0).action()).isEqualTo(Action.IDLE);
    }

    @Test
    void fightersCannotOverlapOrLeaveTheArena() {
        var sim = newSim();
        for (int i = 0; i < 240; i++) sim.step(hold(InputBits.RIGHT), hold(InputBits.LEFT));
        double gap = view(sim, 1).x() - view(sim, 0).x();
        assertThat(gap).isGreaterThanOrEqualTo(PROTO.body().width() - 1e-6);

        for (int i = 0; i < 400; i++) sim.step(hold(InputBits.LEFT), NONE);
        assertThat(view(sim, 0).x()).isEqualTo(PROTO.body().width() / 2);
    }

    @Test
    void lightAttackInRangeDealsDamageAndKnockback() {
        var sim = newSim();
        sim.place(0, 700, 0);
        sim.place(1, 820, 0);
        sim.step(press(InputBits.LIGHT), NONE);

        List<MatchSnapshot> hits = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            sim.step(NONE, NONE);
            if (!sim.snapshot().events().isEmpty()) hits.add(sim.snapshot());
        }
        assertThat(hits).hasSize(1); // a move connects at most once
        var hit = hits.get(0).events().get(0);
        assertThat(hit.attacker()).isZero();
        assertThat(hit.move()).isEqualTo("light");

        var def = PROTO.move("light");
        FighterView p2 = view(sim, 1);
        assertThat(p2.health()).isEqualTo(PROTO.maxHealth() - def.damage());
        assertThat(p2.x()).isGreaterThan(820); // pushed away from attacker
    }

    @Test
    void knockbackVelocityIsImpulseOverMass() {
        var sim = newSim();
        sim.place(0, 700, 0);
        sim.place(1, 820, 0);
        sim.step(press(InputBits.HEAVY), NONE);
        var heavy = PROTO.move("heavy");
        for (int i = 0; i < heavy.startup() + 2 && sim.snapshot().events().isEmpty(); i++) sim.step(NONE, NONE);
        assertThat(sim.snapshot().events()).hasSize(1);
        FighterView p2 = view(sim, 1);
        assertThat(p2.vx()).isCloseTo(heavy.impulse().x() / PROTO.mass(), within(0.1));
        assertThat(p2.vy()).isCloseTo(heavy.impulse().y() / PROTO.mass(), within(0.1));
        assertThat(p2.action()).isEqualTo(Action.HITSTUN);
        assertThat(sim.snapshot().hitstop()).isEqualTo(heavy.hitstop());
    }

    @Test
    void heavierFightersAreLaunchedLess() {
        FighterDefinition heavyBody = new FighterDefinition("tank", "Tank", PROTO.fighterClass(), PROTO.color(),
            PROTO.mass() * 2, PROTO.maxHealth(), PROTO.walkSpeed(), PROTO.jumpVelocity(),
            PROTO.airAcceleration(), PROTO.body(), PROTO.moves());
        var catalog = FighterCatalog.of(List.of(PROTO, heavyBody));
        var sim = new MatchSimulation(Arena.THE_LAB, catalog.create("prototype"), catalog.create("tank"), 0);
        sim.place(0, 700, 0);
        sim.place(1, 820, 0);
        sim.step(press(InputBits.HEAVY), NONE);
        while (sim.snapshot().events().isEmpty()) sim.step(NONE, NONE);
        assertThat(view(sim, 1).vx()).isCloseTo(PROTO.move("heavy").impulse().x() / (PROTO.mass() * 2), within(0.1));
    }

    @Test
    void attackOutOfRangeWhiffs() {
        var sim = newSim();
        sim.step(press(InputBits.HEAVY), NONE);
        idle(sim, 40);
        assertThat(view(sim, 1).health()).isEqualTo(PROTO.maxHealth());
        assertThat(view(sim, 0).action()).isEqualTo(Action.IDLE);
    }

    @Test
    void pressDuringRecoveryIsBufferedAndComesOutWhenFree() {
        var sim = newSim();
        sim.step(press(InputBits.LIGHT), NONE);
        int total = PROTO.move("light").totalFrames();
        idle(sim, total - 3);
        sim.step(press(InputBits.LIGHT), NONE); // pressed 2 ticks before recovery ends
        idle(sim, 3);
        assertThat(view(sim, 0).action()).isEqualTo(Action.ATTACK);
        assertThat(view(sim, 0).move()).isEqualTo("light");
    }

    @Test
    void koEndsTheMatchWithAWinner() {
        var sim = newSim();
        int guard = 0;
        while (sim.phase() == MatchPhase.FIGHTING && guard++ < 10_000) {
            // keep the attacker glued to the defender and mash heavy
            sim.place(0, Math.max(100, view(sim, 1).x() - 120), 0);
            sim.step(press(InputBits.HEAVY), NONE);
            idle(sim, PROTO.move("heavy").totalFrames() + 30);
        }
        assertThat(sim.phase()).isEqualTo(MatchPhase.KO);
        assertThat(sim.result()).isEqualTo(new MatchResult(0, MatchResult.Reason.KO, sim.result().ticks()));
        assertThat(view(sim, 1).action()).isEqualTo(Action.KO);

        idle(sim, MatchSimulation.KO_TICKS);
        assertThat(sim.phase()).isEqualTo(MatchPhase.FINISHED);
    }

    @Test
    void simulationIsDeterministic() {
        var a = newSim();
        var b = newSim();
        java.util.Random rng = new java.util.Random(42);
        int prev0 = 0, prev1 = 0;
        for (int i = 0; i < 1200; i++) {
            int b0 = rng.nextInt(InputBits.ALL + 1), b1 = rng.nextInt(InputBits.ALL + 1);
            InputFrame i0 = new InputFrame(b0, b0 & ~prev0), i1 = new InputFrame(b1, b1 & ~prev1);
            prev0 = b0; prev1 = b1;
            a.step(i0, i1);
            b.step(i0, i1);
        }
        assertThat(a.snapshot()).isEqualTo(b.snapshot());
    }
}
