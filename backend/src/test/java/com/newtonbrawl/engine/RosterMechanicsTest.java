package com.newtonbrawl.engine;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Action;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.FighterView;
import com.newtonbrawl.engine.sim.GameEvent;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.engine.sim.MatchSnapshot;
import com.newtonbrawl.engine.sim.Projectile;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Every special and ultimate of the starter roster, tested against the law it's based on. */
class RosterMechanicsTest {

    static final FighterCatalog CATALOG = FighterCatalog.loadFromClasspath();
    static final Arena EMPTY = new Arena("test", "Test", 1600, 900, 2600, 1, 0.45, 0.6, List.of());
    static final InputFrame NONE = InputFrame.NONE;
    static final MatchRules RULES = MatchRules.STANDARD.withCountdown(0);

    static MatchSimulation sim(String a, String b, Arena arena) {
        return new MatchSimulation(arena, CATALOG.create(a), CATALOG.create(b), RULES);
    }

    static MatchSimulation sim(String a, String b) {
        return sim(a, b, EMPTY);
    }

    static InputFrame press(int bits) { return new InputFrame(bits, bits); }
    static InputFrame special2() { return new InputFrame(InputBits.DOWN | InputBits.SPECIAL, InputBits.SPECIAL); }

    static FighterView v(MatchSimulation s, int slot) { return s.snapshot().fighters().get(slot); }

    static int hp(String f) { return CATALOG.definition(f).maxHealth(); }
    static MoveDefinition move(String fighter, String id) { return CATALOG.definition(fighter).move(id); }

    /** Steps until the predicate holds, collecting events of the given type. Fails after a limit. */
    static List<GameEvent> runUntil(MatchSimulation s, int maxTicks, java.util.function.Predicate<MatchSnapshot> done, String type) {
        List<GameEvent> out = new ArrayList<>();
        for (int i = 0; i < maxTicks; i++) {
            s.step(NONE, NONE);
            MatchSnapshot snap = s.snapshot();
            snap.events().stream().filter(e -> e.type().equals(type)).forEach(out::add);
            if (done.test(snap)) return out;
        }
        return out;
    }

    static List<GameEvent> idle(MatchSimulation s, int ticks, String type) {
        return runUntil(s, ticks, snap -> false, type);
    }

    // ------------------------------------------------------------------ Newton

    @Test
    void appleDropFallsAtRealGravityAndLandsOnTheOpponent() {
        var s = sim("newton", "tesla");
        s.step(press(InputBits.SPECIAL), NONE);
        runUntil(s, 40, snap -> !snap.projectiles().isEmpty(), GameEvent.CAST);
        var apple = s.snapshot().projectiles().get(0);
        assertThat(apple.kind()).isEqualTo("apple");
        assertThat(apple.x()).isEqualTo(v(s, 1).x()); // appears above the opponent
        double y0 = apple.y();
        idle(s, 30, GameEvent.HIT);
        var later = s.snapshot().projectiles().get(0);
        // After 30 more ticks: v = g·t and Δy ≈ ½·g·t² with g = 9.8 m/s² = 980 units/s².
        double t = 30 / 60.0;
        assertThat(later.vy()).isCloseTo(-980 * t, within(1.0));
        assertThat(y0 - later.y()).isCloseTo(0.5 * 980 * t * t, within(5.0));

        var hits = runUntil(s, 120, snap -> snap.projectiles().isEmpty(), GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).health()).isEqualTo(hp("tesla") - move("newton", "special1").damage());
    }

    @Test
    void gravityFlipSendsTheTargetFloatingUpThenBackDown() {
        var s = sim("newton", "tesla");
        s.place(0, 700, 0);
        s.place(1, 1000, 0);
        s.step(special2(), NONE);
        var hits = runUntil(s, 60, snap -> snap.fighters().get(1).flip() > 0, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).flip()).isGreaterThan((int) move("newton", "special2").param("flipTicks", 0) - 10);
        idle(s, (int) move("newton", "special2").param("flipTicks", 0) - 10, GameEvent.HIT);
        assertThat(v(s, 1).y()).isGreaterThan(150); // drifting up
        assertThat(v(s, 1).grounded()).isFalse();
        runUntil(s, 400, snap -> snap.fighters().get(1).grounded(), GameEvent.HIT);
        assertThat(v(s, 1).flip()).isZero();
        assertThat(v(s, 1).y()).isZero();
    }

    @Test
    void thirdLawUltimateNeedsFullEnergyFreezesForTheCinematicAndReflectsHits() {
        var s = sim("newton", "tesla");
        s.step(press(InputBits.ULTIMATE), NONE);
        assertThat(v(s, 0).action()).isNotEqualTo(Action.ATTACK); // no energy: nothing happens

        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.place(0, 800, 0);
        s.place(1, 900, 0);
        s.step(press(InputBits.ULTIMATE), NONE);
        assertThat(s.snapshot().events()).anyMatch(e -> e.type().equals(GameEvent.ULTIMATE));
        assertThat(v(s, 0).energy()).isZero();
        assertThat(s.snapshot().cinematic()).isEqualTo(EngineConstants.CINEMATIC_TICKS);
        double x1 = v(s, 1).x();
        int timer = s.timer();
        for (int i = 0; i < EngineConstants.CINEMATIC_TICKS; i++) s.step(NONE, new InputFrame(InputBits.LEFT, 0));
        assertThat(v(s, 1).x()).isEqualTo(x1);      // world frozen during the cinematic
        assertThat(s.timer()).isEqualTo(timer);     // and the clock is paused
        idle(s, 20, GameEvent.HIT);
        assertThat(v(s, 0).reflect()).isGreaterThan(0);

        // Tesla jabs Newton: Newton takes nothing, Tesla takes the jab.
        s.step(NONE, press(InputBits.LIGHT));
        var reflects = runUntil(s, 20, snap -> snap.fighters().get(1).health() < hp("tesla"), GameEvent.REFLECT);
        assertThat(reflects).hasSize(1);
        assertThat(v(s, 0).health()).isEqualTo(hp("newton"));
        assertThat(v(s, 1).health()).isEqualTo(hp("tesla") - move("tesla", "light").damage());
        assertThat(v(s, 1).action()).isEqualTo(Action.HITSTUN);
    }

    @Test
    void ultimateAlsoTriggersWithHeavyPlusSpecialTogether() {
        var s = sim("einstein", "tesla");
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        int both = InputBits.HEAVY | InputBits.SPECIAL;
        s.step(new InputFrame(both, both), NONE);
        assertThat(v(s, 0).move()).isEqualTo("ultimate");
    }

    @Test
    void reflectedProjectilesGoBackToTheirOwner() {
        var s = sim("newton", "curie");
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.place(0, 500, 0);
        s.place(1, 1000, 0);
        s.step(press(InputBits.ULTIMATE), NONE);
        idle(s, EngineConstants.CINEMATIC_TICKS + 15, GameEvent.HIT);
        s.step(NONE, press(InputBits.SPECIAL)); // Curie throws an orb at a reflecting Newton
        var reflect = runUntil(s, 200, snap -> snap.events().stream().anyMatch(e -> e.type().equals(GameEvent.REFLECT)), GameEvent.REFLECT);
        assertThat(reflect).hasSize(1);
        var orb = s.snapshot().projectiles().get(0);
        assertThat(orb.owner()).isZero();
        assertThat(orb.reflected()).isTrue();
        assertThat(orb.vx()).isGreaterThan(0); // heading back to Curie
        runUntil(s, 200, snap -> snap.projectiles().isEmpty(), GameEvent.HIT);
        assertThat(v(s, 1).health()).isLessThan(hp("curie"));
        assertThat(v(s, 0).health()).isEqualTo(hp("newton"));
    }

    // ------------------------------------------------------------------- Tesla

    @Test
    void chainLightningArcsThroughAMetalBeakerAndHitsHarder() {
        var s = sim("tesla", "newton", Arena.THE_LAB); // beakers at 250, 800, 1350
        s.place(0, 600, 0);
        s.place(1, 1250, 600); // opponent high in the air: only the chain can reach
        s.step(press(InputBits.SPECIAL), NONE);
        List<GameEvent> arcs = new ArrayList<>(), hits = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            s.step(NONE, NONE);
            s.place(1, 1250, 600); // hold the target in place
            s.snapshot().events().forEach(e -> { if (e.type().equals(GameEvent.ARC)) arcs.add(e); if (e.type().equals(GameEvent.HIT)) hits.add(e); });
            if (!hits.isEmpty()) break;
        }
        assertThat(arcs).isNotEmpty();
        assertThat(arcs.get(0).x()).isEqualTo(800.0);
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).damage()).isEqualTo((int) Math.round(move("tesla", "special1").damage() * 1.25));
    }

    @Test
    void magneticPullDragsTheOpponentAndBeakersTowardTesla() {
        var s = sim("tesla", "curie", Arena.THE_LAB);
        s.place(0, 300, 0);
        s.place(1, 900, 0);   // within the 650-unit pull radius
        s.step(special2(), NONE);
        idle(s, 45, GameEvent.HIT);
        assertThat(v(s, 1).x()).isLessThan(900 - 150);
        assertThat(s.snapshot().objects().get(1).x()).isLessThan(800 - 100); // the middle beaker slid in too
        assertThat(s.snapshot().objects().get(2).x()).isEqualTo(1350.0);     // out of range
    }

    @Test
    void teslaCoilFieldStrikesAnywhereOnTheArena() {
        var s = sim("tesla", "newton");
        s.place(0, 100, 0);
        s.place(1, 1500, 0);
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        var hits = idle(s, EngineConstants.CINEMATIC_TICKS + 260, GameEvent.HIT);
        var ult = move("tesla", "ultimate");
        int strikes = (int) (ult.param("life", 0) / ult.param("interval", 1));
        assertThat(hits).hasSize(strikes);
        assertThat(v(s, 1).health()).isEqualTo(hp("newton") - strikes * ult.damage());
    }

    // ------------------------------------------------------------------- Curie

    @Test
    void radioactiveDecayHalvesDamageEveryHalfLife() {
        var p = new Projectile(1, 0, "orb", "special1");
        p.damage = 128;
        p.halfLife = 40;
        assertThat(p.currentDamage()).isEqualTo(128);
        p.age = 40;
        assertThat(p.currentDamage()).isEqualTo(64);
        p.age = 80;
        assertThat(p.currentDamage()).isEqualTo(32);
        p.age = 20;
        assertThat(p.currentDamage()).isEqualTo(96); // linear between half-lives
    }

    @Test
    void orbHitsHarderUpCloseThanFarAway() {
        var close = sim("curie", "newton");
        close.place(0, 700, 0);
        close.place(1, 900, 0);
        close.step(press(InputBits.SPECIAL), NONE);
        var near = runUntil(close, 300, snap -> false, GameEvent.HIT);

        var far = sim("curie", "newton");
        far.place(0, 200, 0);
        far.place(1, 1450, 0);
        far.step(press(InputBits.SPECIAL), NONE);
        var distant = runUntil(far, 300, snap -> false, GameEvent.HIT);

        assertThat(near).hasSize(1);
        assertThat(distant).hasSize(1);
        assertThat(near.get(0).damage()).isGreaterThan(distant.get(0).damage() * 3);
    }

    @Test
    void glowTrapStunsWhoeverStepsOnItAndOnlyOneExists() {
        var s = sim("curie", "einstein");
        s.place(0, 500, 0);
        s.place(1, 1200, 0);
        s.step(special2(), NONE);
        idle(s, 50, GameEvent.HIT);
        assertThat(s.snapshot().zones()).hasSize(1);
        assertThat(s.snapshot().zones().get(0).armed()).isTrue();
        double trapX = s.snapshot().zones().get(0).x();

        // Walk the opponent onto the trap.
        List<GameEvent> hits = new ArrayList<>();
        for (int i = 0; i < 200 && hits.isEmpty(); i++) {
            s.step(NONE, new InputFrame(InputBits.LEFT, 0));
            s.snapshot().events().stream().filter(e -> e.type().equals(GameEvent.HIT)).forEach(hits::add);
        }
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).stun()).isGreaterThan(60);
        assertThat(v(s, 1).x()).isCloseTo(trapX, within(120.0));
        assertThat(s.snapshot().zones()).isEmpty();
    }

    @Test
    void chainReactionSpreadsBlastsOutward() {
        var s = sim("curie", "newton");
        s.place(0, 500, 0);
        s.place(1, 700, 0);   // inside the core blast
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        List<Integer> delays = new ArrayList<>();
        var hits = runUntil(s, 200, snap -> {
            if (delays.isEmpty() && !snap.zones().isEmpty()) snap.zones().forEach(z -> delays.add(z.delay()));
            return false;
        }, GameEvent.HIT);
        assertThat(delays).hasSize(7).contains(0, 10, 20, 30);
        assertThat(hits.size()).isGreaterThanOrEqualTo(2);
    }

    // ---------------------------------------------------------------- Einstein

    @Test
    void lightDashBlinksForwardAndIsInvulnerable() {
        var s = sim("einstein", "tesla");
        s.place(0, 400, 0);
        s.place(1, 1300, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        idle(s, move("einstein", "special1").startup(), GameEvent.HIT);
        assertThat(v(s, 0).x()).isCloseTo(400 + 320, within(1.0));
        assertThat(v(s, 0).invuln()).isGreaterThan(0);
    }

    @Test
    void timeDilationBubbleSlowsTheOpponentToFortyPercent() {
        var s = sim("einstein", "tesla");
        s.place(0, 400, 0);
        s.place(1, 640, 0);
        s.step(special2(), NONE);
        idle(s, move("einstein", "special2").startup() + 1, GameEvent.HIT);
        assertThat(s.snapshot().zones()).anyMatch(z -> z.kind().equals("BUBBLE"));
        double x0 = v(s, 1).x();
        for (int i = 0; i < 50; i++) s.step(NONE, new InputFrame(InputBits.RIGHT, 0)); // walking out, slowly
        double moved = v(s, 1).x() - x0;
        double normal = 50 * move("tesla", "light").startup() * 0 + 50 * CATALOG.definition("tesla").walkSpeed() / 60;
        assertThat(moved).isCloseTo(normal * 0.4, within(normal * 0.08));
    }

    @Test
    void emc2BeamCrossesTheWholeArena() {
        var s = sim("einstein", "curie");
        s.place(0, 100, 0);
        s.place(1, 1500, 0);
        s.setEnergy(0, EngineConstants.ENERGY_MAX);
        s.step(press(InputBits.ULTIMATE), NONE);
        var hits = idle(s, EngineConstants.CINEMATIC_TICKS + 60, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).damage()).isEqualTo(move("einstein", "ultimate").damage());
    }

    // ------------------------------------------------------------ shared rules

    @Test
    void specialsHaveCooldowns() {
        var s = sim("curie", "newton");
        s.step(press(InputBits.SPECIAL), NONE);
        idle(s, move("curie", "special1").totalFrames() + 2, GameEvent.HIT);
        assertThat(v(s, 0).cd1()).isGreaterThan(0);
        s.step(press(InputBits.SPECIAL), NONE);
        assertThat(v(s, 0).action()).isNotEqualTo(Action.ATTACK);
    }

    @Test
    void hittingABeakerThrowsItIntoTheOpponent() {
        var s = sim("newton", "tesla", Arena.THE_LAB);
        s.place(0, 700, 0);   // beaker at 800, right in front
        s.place(1, 1150, 0);
        s.step(press(InputBits.HEAVY), NONE);
        var clank = runUntil(s, 30, snap -> snap.events().stream().anyMatch(e -> e.type().equals(GameEvent.CLANK)), GameEvent.CLANK);
        assertThat(clank).hasSize(1);
        var hits = runUntil(s, 90, snap -> snap.fighters().get(1).health() < hp("tesla"), GameEvent.HIT);
        assertThat(hits).anyMatch(e -> e.move().equals("object"));
        assertThat(v(s, 1).health()).isEqualTo(hp("tesla") - 60);
    }

    @Test
    void decidingKoPlaysInSlowMotion() {
        var s = sim("prototype", "prototype");
        // Two quick KOs for P1; watch the knocked-out P2 on the deciding one.
        for (int r = 0; r < 2; r++) {
            int guard = 0;
            while (s.phase() == MatchPhase.FIGHTING && guard++ < 5000) {
                s.place(0, 700, 0); // mid-stage, so the final knockback has room to slide
                s.place(1, 820, 0);
                s.step(press(InputBits.HEAVY), NONE);
                runUntil(s, 50, snap -> snap.phase() != MatchPhase.FIGHTING, GameEvent.HIT); // stop right at the KO
            }
            if (r == 0) runUntil(s, 400, snap -> snap.phase() == MatchPhase.FIGHTING, GameEvent.HIT);
        }
        assertThat(s.result()).isNotNull();
        assertThat(s.phase()).isEqualTo(MatchPhase.ROUND_END);
        // During slow motion physics (incl. the KO punch's hit-stop) only runs every third tick,
        // so the knocked-out fighter never moves on two consecutive ticks.
        int moves = 0;
        boolean movedLast = false, consecutive = false;
        double last = v(s, 1).x();
        for (int i = 0; i < EngineConstants.SLOWMO_TICKS - 1; i++) {
            s.step(NONE, NONE);
            boolean moved = v(s, 1).x() != last;
            if (moved) moves++;
            if (moved && movedLast) consecutive = true;
            movedLast = moved;
            last = v(s, 1).x();
        }
        assertThat(moves).isGreaterThan(5);
        assertThat(consecutive).isFalse();
    }
}
