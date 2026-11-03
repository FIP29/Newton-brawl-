package com.newtonbrawl.engine;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import com.newtonbrawl.engine.sim.ObjectView;
import com.newtonbrawl.engine.sim.ProjectileView;
import com.newtonbrawl.engine.sim.ZoneView;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Schrödinger, Heisenberg, Hawking, Doppler and the Black Hole Edge. */
class Phase7MechanicsTest {

    static final FighterCatalog CATALOG = FighterCatalog.loadFromClasspath();
    static final Arena EMPTY = new Arena("test", "Test", 1600, 900, 2600, 1, 0.45, 0.6, List.of());
    static final InputFrame NONE = InputFrame.NONE;

    static MatchSimulation sim(String a, String b, Arena arena) {
        return new MatchSimulation(arena, CATALOG.create(a), CATALOG.create(b), MatchRules.STANDARD.withCountdown(0));
    }

    static MatchSimulation sim(String a, String b) { return sim(a, b, EMPTY); }

    static InputFrame press(int bits) { return new InputFrame(bits, bits); }
    static InputFrame hold(int bits) { return new InputFrame(bits, 0); }
    static InputFrame special2() { return new InputFrame(InputBits.DOWN | InputBits.SPECIAL, InputBits.SPECIAL); }
    static FighterView v(MatchSimulation s, int slot) { return s.snapshot().fighters().get(slot); }
    static MoveDefinition move(String f, String id) { return CATALOG.definition(f).move(id); }

    /** Steps with fixed inputs, collecting events of one type. */
    static List<GameEvent> run(MatchSimulation s, int ticks, InputFrame p1, InputFrame p2, String type) {
        List<GameEvent> out = new ArrayList<>();
        for (int i = 0; i < ticks; i++) {
            s.step(p1, p2);
            s.snapshot().events().stream().filter(e -> e.type().equals(type)).forEach(out::add);
        }
        return out;
    }

    static List<GameEvent> run(MatchSimulation s, int ticks, String type) { return run(s, ticks, NONE, NONE, type); }

    static void ultimate(MatchSimulation s, int slot) {
        s.setEnergy(slot, EngineConstants.ENERGY_MAX);
        if (slot == 0) s.step(press(InputBits.ULTIMATE), NONE); else s.step(NONE, press(InputBits.ULTIMATE));
    }

    // ------------------------------------------------------------- randomness

    @Test
    void matchRandomnessIsFairAndRepeatable() {
        var a = sim("schrodinger", "newton");
        var b = sim("schrodinger", "newton");
        int heads = 0;
        int[] thirds = new int[3];
        for (int i = 0; i < 6000; i++) {
            int x = a.random(2);
            assertThat(b.random(2)).isEqualTo(x); // same seed → same sequence (replays, parity)
            heads += x == 0 ? 1 : 0;
            thirds[a.random(3)]++;
            b.random(3);
        }
        assertThat(heads).isBetween(2850, 3150);
        for (int t : thirds) assertThat(t).isBetween(1850, 2150);
    }

    // ------------------------------------------------------------- Schrödinger

    /** Schrödinger casts Superposition, then Newton jabs him. {@code burn} advances the generator first. */
    static MatchSimulation superposedAndHit(int burn) {
        var s = sim("schrodinger", "newton");
        for (int i = 0; i < burn; i++) s.random(2);
        s.place(0, 600, 0);
        s.place(1, 700, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        run(s, move("schrodinger", "special1").startup() + 2, GameEvent.HIT);
        assertThat(s.snapshot().zones()).extracting(ZoneView::kind).containsExactly("GHOST");
        return s;
    }

    @Test
    void superpositionCollapsesEitherWayAndOnlyOnce() {
        Set<Integer> outcomes = new HashSet<>();
        for (int burn = 0; burn < 12; burn++) {
            var s = superposedAndHit(burn);
            double ghostX = s.snapshot().zones().get(0).x();
            s.step(NONE, press(InputBits.LIGHT));
            List<GameEvent> collapses = new ArrayList<>(), hits = new ArrayList<>();
            for (int t = 0; t < 30; t++) {
                s.step(NONE, NONE);
                for (GameEvent e : s.snapshot().events()) {
                    if (e.type().equals(GameEvent.COLLAPSE)) collapses.add(e);
                    if (e.type().equals(GameEvent.HIT)) hits.add(e);
                }
            }
            assertThat(collapses).hasSize(1);
            assertThat(s.snapshot().zones()).isEmpty(); // the ghost is gone either way
            boolean dodged = collapses.get(0).damage() == 1;
            outcomes.add(collapses.get(0).damage());
            if (dodged) {
                // He was the ghost all along: he's over there, untouched.
                assertThat(hits).isEmpty();
                assertThat(v(s, 0).x()).isEqualTo(ghostX);
                assertThat(v(s, 0).health()).isEqualTo(950);
            } else {
                assertThat(hits).hasSize(1);
                assertThat(v(s, 0).health()).isEqualTo(950 - move("newton", "light").damage());
            }
        }
        assertThat(outcomes).containsExactlyInAnyOrder(0, 1);
    }

    @Test
    void catBoxOpensAliveOrDead() {
        Set<String> seen = new HashSet<>();
        for (int burn = 0; burn < 12; burn++) {
            var s = sim("schrodinger", "newton");
            for (int i = 0; i < burn; i++) s.random(2);
            s.place(0, 500, 0);
            s.place(1, 800, 0);
            s.step(special2(), NONE);
            run(s, move("schrodinger", "special2").startup(), GameEvent.HIT);
            assertThat(s.snapshot().zones()).extracting(ZoneView::kind).containsExactly("CATBOX");
            var opened = run(s, (int) move("schrodinger", "special2").param("seal", 50) + 1, GameEvent.COLLAPSE);
            assertThat(opened).hasSize(1);
            MatchSnapshot after = s.snapshot();
            if (opened.get(0).damage() == 1) {
                seen.add("alive");
                assertThat(after.projectiles()).extracting(ProjectileView::kind).containsExactly("cat");
                var hits = run(s, 80, GameEvent.HIT);
                assertThat(hits).hasSize(1); // it pounces on Newton
                assertThat(hits.get(0).damage()).isEqualTo(move("schrodinger", "special2").damage());
            } else {
                seen.add("dead");
                assertThat(after.zones()).extracting(ZoneView::kind).containsExactly("CLOUD");
                s.place(1, 690, 0); // walk into the vapour
                var hits = run(s, 100, GameEvent.HIT);
                assertThat(hits).hasSizeGreaterThanOrEqualTo(3);
                assertThat(hits).allSatisfy(h -> assertThat(h.damage()).isEqualTo(26));
            }
        }
        assertThat(seen).containsExactlyInAnyOrder("alive", "dead");
    }

    @Test
    void particleInABoxOnlyNodesAreSafe() {
        // ψ₃ has nodes at L/3 and 2L/3; ψ₂ has its node at L/2. Standing at x = L/3 survives the first
        // wave, but you must reach L/2 before the second.
        double L = EMPTY.width();
        var stay = sim("schrodinger", "newton");
        stay.place(0, 100, 0);
        stay.place(1, L / 3, 0);
        ultimate(stay, 0);
        var stayed = run(stay, EngineConstants.CINEMATIC_TICKS + 110, GameEvent.HIT);
        assertThat(stayed).hasSize(1); // caught by ψ₂'s antinode

        var dodge = sim("schrodinger", "newton");
        dodge.place(0, 100, 0);
        dodge.place(1, L / 3, 0);
        ultimate(dodge, 0);
        run(dodge, EngineConstants.CINEMATIC_TICKS + 40, GameEvent.HIT);
        dodge.place(1, L / 2, 0); // node of ψ₂
        assertThat(run(dodge, 70, GameEvent.HIT)).isEmpty();

        var antinode = sim("schrodinger", "newton");
        antinode.place(0, 100, 0);
        antinode.place(1, L / 2, 0); // antinode of ψ₃
        ultimate(antinode, 0);
        var hit = run(antinode, EngineConstants.CINEMATIC_TICKS + 30, GameEvent.HIT);
        assertThat(hit).hasSize(1);
        assertThat(hit.get(0).move()).isEqualTo("ultimate");
    }

    // -------------------------------------------------------------- Heisenberg

    @Test
    void uncertainPositionLandsAtOneOfThreeDistances() {
        Set<Double> distances = new HashSet<>();
        for (int burn = 0; burn < 30; burn++) {
            var s = sim("heisenberg", "newton");
            for (int i = 0; i < burn; i++) s.random(2);
            s.place(0, 300, 0);
            s.place(1, 1500, 0);
            s.step(press(InputBits.SPECIAL), NONE);
            run(s, move("heisenberg", "special1").startup(), GameEvent.HIT);
            distances.add(v(s, 0).x() - 300);
        }
        assertThat(distances).containsExactlyInAnyOrder(170.0, 270.0, 370.0);
    }

    @Test
    void measurementLeavesMomentumUncertain() {
        Set<Double> kicks = new HashSet<>();
        Set<Double> directions = new HashSet<>();
        for (int burn = 0; burn < 30; burn++) {
            var s = sim("heisenberg", "newton");
            for (int i = 0; i < burn; i++) s.random(2);
            s.place(0, 500, 0);
            s.place(1, 800, 0);
            s.step(special2(), NONE);
            var hits = new ArrayList<GameEvent>();
            double vx = 0;
            for (int t = 0; t < 40 && hits.isEmpty(); t++) {
                s.step(NONE, NONE);
                s.snapshot().events().stream().filter(e -> e.type().equals(GameEvent.HIT)).forEach(hits::add);
                vx = v(s, 1).vx();
            }
            assertThat(hits).hasSize(1);
            kicks.add(Math.abs(vx));
            directions.add(Math.signum(vx));
        }
        assertThat(directions).containsExactlyInAnyOrder(-1.0, 1.0); // pushed away OR pulled through
        assertThat(kicks).hasSizeGreaterThanOrEqualTo(3);            // and by different amounts
    }

    @Test
    void uncertaintyPrincipleSwapsLeftAndRightAndStrikesAtRandom() {
        var s = sim("heisenberg", "newton");
        s.place(0, 300, 0);
        s.place(1, 1000, 0);
        ultimate(s, 0);
        run(s, EngineConstants.CINEMATIC_TICKS + move("heisenberg", "ultimate").startup() + 1, GameEvent.HIT);
        assertThat(v(s, 1).scramble()).isGreaterThan(250);

        // Wait out any hitstun from the field, then hold RIGHT: he walks LEFT.
        int strikes = 0;
        for (int t = 0; t < 280; t++) {
            s.step(NONE, hold(InputBits.RIGHT));
            strikes += (int) s.snapshot().events().stream().filter(e -> e.type().equals(GameEvent.HIT)).count();
        }
        int intervals = 300 / 20;
        assertThat(strikes).isBetween(2, intervals - 2); // about half of the 15 chances, not all, not none
        assertThat(v(s, 1).x()).isLessThan(1000);

        run(s, 120, GameEvent.HIT); // (status timers pause during hit-stop, so allow for the strikes)
        assertThat(v(s, 1).scramble()).isZero();
        double before = v(s, 1).x();
        run(s, 20, NONE, hold(InputBits.RIGHT), GameEvent.HIT);
        assertThat(v(s, 1).x()).isGreaterThan(before); // wears off: controls are normal again
    }

    // ----------------------------------------------------------------- Hawking

    @Test
    void hawkingRadiationGetsHotterAsTheBlackHoleShrinks() {
        var s = sim("hawking", "newton");
        s.place(0, 200, 0);
        s.place(1, 1550, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        run(s, move("hawking", "special1").startup(), GameEvent.HIT);
        List<Double> sizes = new ArrayList<>();
        List<Integer> damage = new ArrayList<>();
        for (int t = 0; t < 90; t++) {
            ProjectileView p = s.snapshot().projectiles().get(0);
            sizes.add(p.w());
            damage.add(p.damage());
            s.step(NONE, NONE);
        }
        for (int i = 1; i < sizes.size(); i++) {
            assertThat(sizes.get(i)).isLessThan(sizes.get(i - 1));
            assertThat(damage.get(i)).isGreaterThanOrEqualTo(damage.get(i - 1));
        }
        // T ∝ 1/M: damage × size stays constant (= base damage × starting size).
        for (int i = 0; i < sizes.size(); i++) {
            assertThat(damage.get(i) * sizes.get(i)).isCloseTo(26 * 60, within(sizes.get(i) * 0.5 + 1)); // ± rounding
        }
        assertThat(damage.get(damage.size() - 1)).isGreaterThan(3 * 26);
    }

    @Test
    void eventHorizonSwallowsProjectilesAndDragsTheOpponentIn() {
        var s = sim("hawking", "tesla");
        s.place(0, 400, 0);
        s.place(1, 1100, 0);
        s.step(special2(), NONE);
        run(s, move("hawking", "special2").startup(), GameEvent.HIT);
        ZoneView hole = s.snapshot().zones().get(0);
        assertThat(hole.kind()).isEqualTo("SINGULARITY");
        assertThat(hole.x()).isEqualTo(720.0);

        // Tesla's bolt flies straight into it and never comes out.
        s.step(NONE, press(InputBits.SPECIAL));
        List<GameEvent> swallowed = new ArrayList<>(), hits = new ArrayList<>();
        for (int t = 0; t < 70; t++) {
            s.step(NONE, NONE);
            for (GameEvent e : s.snapshot().events()) {
                if (e.type().equals(GameEvent.SWALLOW)) swallowed.add(e);
                if (e.type().equals(GameEvent.HIT)) hits.add(e);
            }
        }
        assertThat(swallowed).hasSize(1);
        assertThat(hits).isEmpty();
        assertThat(v(s, 0).health()).isEqualTo(1000);

        // Standing inside the outer region, Tesla slides toward the centre.
        s.place(1, 860, 0);
        run(s, 20, GameEvent.HIT);
        assertThat(v(s, 1).x()).isLessThan(860);
    }

    @Test
    void supermassiveBlackHoleEvaporatesInAFinalBurst() {
        var s = sim("hawking", "newton");
        s.place(0, 200, 0);
        s.place(1, 1500, 0); // outside the pull: only the evaporation reaches... nothing
        ultimate(s, 0);
        run(s, EngineConstants.CINEMATIC_TICKS + move("hawking", "ultimate").startup(), GameEvent.HIT);
        assertThat(s.snapshot().zones()).extracting(ZoneView::kind).containsExactly("SINGULARITY", "BURST");
        ZoneView burst = s.snapshot().zones().get(1);
        ZoneView hole = s.snapshot().zones().get(0);
        assertThat(burst.delay()).isEqualTo(hole.life() + hole.age()); // goes off exactly when the hole is gone

        var near = sim("hawking", "newton");
        near.place(0, 200, 0);
        near.place(1, 640, 0); // right under it
        ultimate(near, 0);
        var hits = run(near, EngineConstants.CINEMATIC_TICKS + 200, GameEvent.HIT);
        assertThat(hits).isNotEmpty();
        assertThat(hits.get(hits.size() - 1).damage()).isEqualTo(120); // the burst
        assertThat(hits.subList(0, hits.size() - 1)).allSatisfy(h -> assertThat(h.damage()).isEqualTo(22)); // core
    }

    // ----------------------------------------------------------------- Doppler

    /** Damage of a Doppler Shift wave fired at a Newton who holds {@code newtonHold}. */
    static int dopplerDamage(int newtonHold, boolean jumpIn) {
        var s = sim("doppler", "newton");
        s.place(0, 400, 0);
        s.place(1, 1000, 0);
        if (jumpIn) {
            s.step(hold(InputBits.UP | InputBits.RIGHT), NONE);
            s.step(hold(InputBits.RIGHT), NONE);
            s.step(press(InputBits.SPECIAL), NONE);
        } else {
            s.step(press(InputBits.SPECIAL), NONE);
        }
        var hits = run(s, 90, NONE, hold(newtonHold), GameEvent.HIT);
        assertThat(hits).hasSize(1);
        return hits.get(0).damage();
    }

    @Test
    void dopplerShiftDamageFollowsTheObservedFrequency() {
        double c = 820, base = 60;
        int still = dopplerDamage(0, false);
        int approaching = dopplerDamage(InputBits.LEFT, false);
        int receding = dopplerDamage(InputBits.RIGHT, false);
        int jumpIn = dopplerDamage(0, true);
        double walk = CATALOG.definition("newton").walkSpeed();
        double jumpSpeed = CATALOG.definition("doppler").walkSpeed();
        assertThat(still).isEqualTo(60);
        assertThat(approaching).isEqualTo((int) Math.round(base * (c + walk) / c)); // moving observer: f' = f(c + v_o)/c
        assertThat(receding).isEqualTo((int) Math.round(base * (c - walk) / c));
        assertThat(jumpIn).isEqualTo((int) Math.round(base * c / (c - jumpSpeed))); // moving source: f' = f·c/(c − v_s)
        assertThat(jumpIn).isGreaterThan(approaching);
    }

    @Test
    void sonicBoomArrivesAfterDopplerHasPassed() {
        var s = sim("doppler", "newton");
        s.place(0, 400, 0);
        s.place(1, 560, 0);
        s.step(special2(), NONE);
        int startup = move("doppler", "special2").startup();
        int tick = 0, hitTick = -1;
        for (; tick < 40 && hitTick < 0; tick++) {
            s.step(NONE, NONE);
            if (s.snapshot().events().stream().anyMatch(e -> e.type().equals(GameEvent.HIT))) hitTick = tick + 1;
        }
        assertThat(hitTick).isGreaterThan(startup + (int) move("doppler", "special2").param("delay", 5) - 1);
        assertThat(v(s, 0).x()).isGreaterThan(560); // he's already through
        assertThat(v(s, 1).vx()).isGreaterThan(0);  // and the boom shoves Newton the way he went
    }

    @Test
    void blueshiftWavefrontsAreSqueezedTogether() {
        var s = sim("doppler", "newton");
        s.place(0, 200, 0);
        s.place(1, 1500, 0);
        ultimate(s, 0);
        run(s, EngineConstants.CINEMATIC_TICKS + move("doppler", "ultimate").startup(), GameEvent.HIT);
        List<ProjectileView> fronts = s.snapshot().projectiles();
        assertThat(fronts).hasSize(6).allSatisfy(p -> assertThat(p.kind()).isEqualTo("wavefront"));
        for (int i = 1; i < fronts.size(); i++) {
            assertThat(fronts.get(i).x() - fronts.get(i - 1).x()).isCloseTo(140 * (1 - 0.6), within(0.11)); // λ' = λ(1 − v/c)
        }
        s.place(1, 900, 0);
        var hits = run(s, 60, GameEvent.HIT);
        assertThat(hits).hasSizeGreaterThanOrEqualTo(4);
    }

    // ---------------------------------------------------------- Black Hole Edge

    @Test
    void rocksOrbitTheBlackHole() {
        var s = sim("newton", "tesla", Arena.BLACK_HOLE_EDGE);
        s.place(0, 100, 0);
        s.place(1, 1500, 0);
        Arena.Well well = Arena.BLACK_HOLE_EDGE.well();
        double angle = 0, prevA = Double.NaN;
        for (int t = 0; t < 360; t++) {
            s.step(NONE, NONE);
            ObjectView rock = s.snapshot().objects().get(0);
            double dx = rock.x() - well.x(), dy = rock.y() + rock.h() / 2 - well.y();
            double r = Math.sqrt(dx * dx + dy * dy);
            assertThat(r).isBetween(200.0, 330.0); // a bound, roughly circular orbit
            double a = Math.atan2(dy, dx);
            if (!Double.isNaN(prevA)) {
                double d = a - prevA;
                if (d < -Math.PI) d += 2 * Math.PI;
                if (d > Math.PI) d -= 2 * Math.PI;
                angle += d;
            }
            prevA = a;
        }
        assertThat(angle).isGreaterThan(Math.PI * 0.8); // it travels a long way round its orbit in 6 s
    }

    @Test
    void fightersDriftTowardTheHoleAndProjectilesBend() {
        var s = sim("tesla", "newton", Arena.BLACK_HOLE_EDGE);
        s.place(0, 200, 0);
        s.place(1, 1500, 0);
        run(s, 60, GameEvent.HIT);
        assertThat(v(s, 0).x()).isCloseTo(200 + 45, within(1.0)); // tidal drift, 45 units/s
        assertThat(v(s, 1).x()).isCloseTo(1500 - 45, within(1.0));

        s.step(press(InputBits.SPECIAL), NONE);
        run(s, move("tesla", "special1").startup() + 6, GameEvent.HIT);
        ProjectileView bolt = s.snapshot().projectiles().get(0);
        assertThat(bolt.vy()).isGreaterThan(0); // pulled up toward the hole above the platform
    }
}
