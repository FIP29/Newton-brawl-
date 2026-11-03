package com.newtonbrawl.engine;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Action;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.ProjectileView;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Galileo, Archimedes, Faraday, Hooke and the Space Station. */
class Phase6MechanicsTest {

    static final FighterCatalog CATALOG = FighterCatalog.loadFromClasspath();
    static final Arena EMPTY = new Arena("test", "Test", 1600, 900, 2600, 1, 0.45, 0.6, List.of());
    static final InputFrame NONE = InputFrame.NONE;

    static MatchSimulation sim(String a, String b, Arena arena) {
        return new MatchSimulation(arena, CATALOG.create(a), CATALOG.create(b), MatchRules.STANDARD.withCountdown(0));
    }

    static MatchSimulation sim(String a, String b) { return sim(a, b, EMPTY); }

    static InputFrame press(int bits) { return new InputFrame(bits, bits); }
    static InputFrame special2() { return new InputFrame(InputBits.DOWN | InputBits.SPECIAL, InputBits.SPECIAL); }
    static FighterView v(MatchSimulation s, int slot) { return s.snapshot().fighters().get(slot); }
    static MoveDefinition move(String f, String id) { return CATALOG.definition(f).move(id); }

    static List<GameEvent> run(MatchSimulation s, int ticks, InputFrame p2, String type) {
        List<GameEvent> out = new ArrayList<>();
        for (int i = 0; i < ticks; i++) {
            s.step(NONE, p2);
            s.snapshot().events().stream().filter(e -> e.type().equals(type)).forEach(out::add);
        }
        return out;
    }

    static List<GameEvent> run(MatchSimulation s, int ticks, String type) { return run(s, ticks, NONE, type); }

    // ----------------------------------------------------------------- Galileo

    @Test
    void pendulumKeepsItsPeriodTwoPiRootLOverG() {
        var s = sim("galileo", "tesla");
        s.place(0, 300, 0);
        s.place(1, 1400, 0); // out of reach: watch a full swing
        s.step(press(InputBits.SPECIAL), NONE);
        run(s, move("galileo", "special1").startup(), GameEvent.HIT);
        ProjectileView start = s.snapshot().projectiles().get(0);
        double pivot = 300 + 70;
        List<Integer> crossings = new ArrayList<>();
        double prev = start.x() - pivot;
        for (int t = 1; t <= 76; t++) {
            s.step(NONE, NONE);
            double now = s.snapshot().projectiles().get(0).x() - pivot;
            if (Math.signum(now) != Math.signum(prev) && now != 0) crossings.add(t);
            prev = now;
        }
        // Two passes through the bottom, half a period apart: T/2 = π√(L/g) ≈ 38.8 ticks.
        assertThat(crossings).hasSize(2);
        double halfPeriodTicks = Math.PI * Math.sqrt(110.0 / 2600) * 60;
        assertThat((double) (crossings.get(1) - crossings.get(0))).isCloseTo(halfPeriodTicks, within(1.5));
    }

    @Test
    void pendulumHitsWhenItSwingsThroughTheOpponent() {
        var s = sim("galileo", "tesla");
        s.place(0, 600, 0);
        s.place(1, 740, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        var hits = run(s, 90, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).move()).isEqualTo("special1");
    }

    @Test
    void heavyAndLightBallsFallTogether() {
        var s = sim("galileo", "newton");
        s.place(0, 300, 0);
        s.place(1, 1200, 0);
        s.step(special2(), NONE);
        run(s, move("galileo", "special2").startup(), GameEvent.HIT);
        for (int i = 0; i < 40; i++) {
            List<ProjectileView> balls = s.snapshot().projectiles();
            assertThat(balls).hasSize(2);
            assertThat(balls.get(0).w()).isGreaterThan(balls.get(1).w()); // cannonball vs musket ball
            assertThat(balls.get(0).y()).isEqualTo(balls.get(1).y());     // same height, every tick
            assertThat(balls.get(0).vy()).isEqualTo(balls.get(1).vy());
            s.step(NONE, NONE);
        }
        var hits = run(s, 120, GameEvent.HIT);
        assertThat(hits).hasSize(2);
        assertThat(s.snapshot().fighters().get(1).health()).isEqualTo(1100 - 2 * move("galileo", "special2").damage());
    }

    @Test
    void galileanMoonsOrbitWithKeplersThirdLaw() {
        var s = sim("galileo", "newton");
        s.place(0, 400, 0);
        s.place(1, 1500, 0);
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        run(s, EngineConstants.CINEMATIC_TICKS + move("galileo", "ultimate").startup(), GameEvent.HIT);
        assertThat(s.snapshot().projectiles()).extracting(ProjectileView::kind).containsExactly("io", "europa", "ganymede", "callisto");
        MoveDefinition ult = move("galileo", "ultimate");
        double cy = 0.55 * 190;
        // Radius is conserved (symplectic integration) …
        for (int t = 0; t < 120; t++) {
            s.step(NONE, NONE);
            List<ProjectileView> moons = s.snapshot().projectiles();
            for (int i = 0; i < 4; i++) {
                double r = Math.hypot(moons.get(i).x() - 400, moons.get(i).y() - cy);
                assertThat(r).isCloseTo(ult.param("r" + (i + 1), 0), within(ult.param("r" + (i + 1), 0) * 0.08));
            }
        }
        // … and the ω values follow T² ∝ r³.
        for (int i = 2; i <= 4; i++) {
            double ratioT = ult.param("w1", 0) / ult.param("w" + i, 0);
            double ratioR = ult.param("r" + i, 0) / ult.param("r1", 1);
            assertThat(ratioT * ratioT).isCloseTo(ratioR * ratioR * ratioR, within(0.01));
        }
    }

    // -------------------------------------------------------------- Archimedes

    @Test
    void leverMultipliesTheLaunch() {
        var s = sim("archimedes", "curie");
        s.place(0, 600, 0);
        s.place(1, 750, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        var hits = run(s, 30, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        var m = move("archimedes", "special1");
        // vy right after the hit = (input impulse × lever ratio) / mass, minus at most one tick of gravity
        assertThat(s.snapshot().fighters().get(1).vy()).isGreaterThan(m.impulse().y() * 4 / 62 * 0.8);
    }

    @Test
    void buoyancyBubbleFloatsTheTargetHelplessly() {
        var s = sim("archimedes", "tesla");
        s.place(0, 600, 0);
        s.place(1, 800, 0);
        s.step(special2(), NONE);
        run(s, 40, GameEvent.HIT);
        assertThat(v(s, 1).buoy()).isGreaterThan(100);
        double x = v(s, 1).x();
        run(s, 60, new InputFrame(InputBits.RIGHT, 0), GameEvent.HIT); // tries to walk away: can't
        assertThat(v(s, 1).y()).isGreaterThan(50);
        assertThat(Math.abs(v(s, 1).x() - x)).isLessThan(60);
    }

    @Test
    void burningMirrorsHitWhereTheyAimed() {
        var stays = sim("archimedes", "tesla");
        stays.place(0, 300, 0);
        stays.place(1, 1100, 0);
        stays.setEnergy(0, EngineConstants.ENERGY_MAX);
        stays.step(press(InputBits.ULTIMATE), NONE);
        assertThat(run(stays, 150, GameEvent.HIT)).hasSize(1);

        var dodges = sim("archimedes", "tesla");
        dodges.place(0, 300, 0);
        dodges.place(1, 1100, 0);
        dodges.setEnergy(0, EngineConstants.ENERGY_MAX);
        dodges.step(press(InputBits.ULTIMATE), NONE);
        run(dodges, EngineConstants.CINEMATIC_TICKS + 12, GameEvent.HIT); // mirrors lock on
        assertThat(run(dodges, 100, new InputFrame(InputBits.RIGHT, 0), GameEvent.HIT)).isEmpty();
    }

    // ----------------------------------------------------------------- Faraday

    @Test
    void faradayCageStopsTeslasLightning() {
        var s = sim("faraday", "tesla");
        s.place(0, 600, 0);
        s.place(1, 1100, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        run(s, 10, GameEvent.HIT);
        assertThat(v(s, 0).cage()).isGreaterThan(150);
        s.step(NONE, press(InputBits.SPECIAL)); // Tesla's Chain Lightning
        var blocks = run(s, 60, GameEvent.BLOCK);
        assertThat(blocks).hasSize(1);
        assertThat(v(s, 0).health()).isEqualTo(980);

        // Tesla Coil does nothing while the cage holds.
        s.setEnergy(1, EngineConstants.ENERGY_MAX);
        s.step(NONE, press(InputBits.ULTIMATE));
        run(s, 100, GameEvent.HIT);
        assertThat(v(s, 0).health()).isEqualTo(980);
    }

    @Test
    void inductionOnlyHurtsWhatMoves() {
        var still = sim("faraday", "newton");
        still.place(0, 400, 0);
        still.place(1, 570, 0);
        still.step(special2(), NONE);
        assertThat(run(still, 200, GameEvent.HIT)).isEmpty();

        var moving = sim("faraday", "newton");
        moving.place(0, 400, 0);
        moving.place(1, 570, 0);
        moving.step(special2(), NONE);
        run(moving, 12, GameEvent.HIT);
        List<GameEvent> hits = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            InputFrame pace = new InputFrame((i / 20) % 2 == 0 ? InputBits.RIGHT : InputBits.LEFT, 0);
            moving.step(NONE, pace);
            moving.snapshot().events().stream().filter(e -> e.type().equals(GameEvent.HIT)).forEach(hits::add);
        }
        assertThat(hits).isNotEmpty();
        assertThat(hits).allMatch(e -> e.move().equals("special2"));
    }

    @Test
    void dynamoPullsInAndShocks() {
        var s = sim("faraday", "einstein");
        s.place(0, 600, 0);
        s.place(1, 850, 0);
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        var hits = run(s, EngineConstants.CINEMATIC_TICKS + 200, GameEvent.HIT);
        assertThat(hits.size()).isGreaterThanOrEqualTo(4);
    }

    // ------------------------------------------------------------------- Hooke

    @Test
    void springSnapsHarderTheFartherItIsStretched() {
        double near = springLaunch(80), far = springLaunch(450);
        assertThat(far).isGreaterThan(near * 3);
    }

    /** Hooke lays a spring, walks `distance` away, the opponent steps on it: returns the launch vy. */
    private double springLaunch(double distance) {
        var s = sim("hooke", "curie");
        s.place(0, 700, 0);
        s.place(1, 1300, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        run(s, 40, GameEvent.HIT);
        s.place(0, 700 - distance, 0);
        s.place(1, 760, 0);
        for (int i = 0; i < 40; i++) {
            s.step(NONE, new InputFrame(InputBits.LEFT, 0));
            s.place(0, 700 - distance, 0);
            if (s.snapshot().events().stream().anyMatch(e -> e.type().equals(GameEvent.HIT))) {
                return s.snapshot().fighters().get(1).vy();
            }
        }
        throw new AssertionError("spring never triggered");
    }

    @Test
    void elasticWhipReachesFarAndYanksTheTargetIn() {
        var s = sim("hooke", "newton");
        s.place(0, 400, 0);
        s.place(1, 700, 0); // well beyond a normal punch
        s.step(special2(), NONE);
        var hits = run(s, 20, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).vx()).isLessThan(0); // pulled back toward Hooke
    }

    @Test
    void breakingPointShattersTheOpponentsTraps() {
        var s = sim("hooke", "curie");
        s.place(0, 500, 0);
        s.place(1, 900, 0);
        s.step(NONE, special2()); // Curie lays a glow trap
        run(s, 20, GameEvent.HIT);
        assertThat(s.snapshot().zones()).anyMatch(z -> z.kind().equals("TRAP"));
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        var shatter = run(s, EngineConstants.CINEMATIC_TICKS + 12, GameEvent.SHATTER);
        assertThat(shatter).hasSize(1);
        assertThat(s.snapshot().zones()).noneMatch(z -> z.kind().equals("TRAP"));
        assertThat(run(s, 30, GameEvent.HIT)).hasSize(1);
    }

    // ------------------------------------------------------------ Space Station

    @Test
    void spaceStationDebrisFloatsAndBounces() {
        var s = sim("newton", "tesla", Arena.SPACE_STATION);
        var before = s.snapshot().objects();
        assertThat(before).hasSize(4);
        run(s, 60, GameEvent.HIT);
        var after = s.snapshot().objects();
        for (int i = 0; i < 4; i++) {
            // no gravity: vertical velocity unchanged unless it bounced
            assertThat(Math.abs(after.get(i).vy())).isCloseTo(Math.abs(before.get(i).vy()), within(Math.abs(before.get(i).vy()) * 0.2 + 0.2));
        }
        // Lots of time later they're still drifting (elastic bounces, no friction in zero-g).
        run(s, 1200, GameEvent.HIT);
        assertThat(s.snapshot().objects()).allMatch(o -> Math.abs(o.vx()) + Math.abs(o.vy()) > 5);
        assertThat(s.snapshot().objects()).allMatch(o -> o.x() >= 0 && o.x() <= 1600 && o.y() >= 0 && o.y() <= 900);
    }

    @Test
    void lowGravityMeansHigherJumps() {
        var lab = sim("newton", "tesla", Arena.THE_LAB);
        var station = sim("newton", "tesla", Arena.SPACE_STATION);
        lab.step(new InputFrame(InputBits.UP, InputBits.UP), NONE);
        station.step(new InputFrame(InputBits.UP, InputBits.UP), NONE);
        double labApex = 0, stationApex = 0;
        for (int i = 0; i < 200; i++) {
            lab.step(NONE, NONE);
            station.step(NONE, NONE);
            labApex = Math.max(labApex, v(lab, 0).y());
            stationApex = Math.max(stationApex, v(station, 0).y());
        }
        // h = v²/2g: same jump velocity, gravity 1100 vs 2600 (the ceiling caps the station jump)
        assertThat(stationApex).isGreaterThan(labApex * 2);
        assertThat(v(station, 0).action()).isEqualTo(Action.IDLE);
    }
}
