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
import com.newtonbrawl.engine.sim.ObjectView;
import com.newtonbrawl.engine.sim.ProjectileView;
import com.newtonbrawl.engine.sim.ZoneView;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Bernoulli, Edison, S.N. Bose, J.C. Bose, Heisenberg's evasion and Curzon Hall. */
class Phase8MechanicsTest {

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

    static double peakHeight(MatchSimulation s, InputFrame first) {
        s.step(first, NONE);
        double peak = 0;
        for (int t = 0; t < 120; t++) {
            s.step(NONE, NONE);
            peak = Math.max(peak, v(s, 0).y());
        }
        return peak;
    }

    // ---------------------------------------------------------------- Bernoulli

    @Test
    void liftJumpRisesFarHigherThanAJump() {
        var jump = sim("bernoulli", "newton");
        jump.place(0, 300, 0);
        jump.place(1, 1400, 0);
        double normal = peakHeight(jump, hold(InputBits.UP));
        var lift = sim("bernoulli", "newton");
        lift.place(0, 300, 0);
        lift.place(1, 1400, 0);
        double lifted = peakHeight(lift, press(InputBits.SPECIAL));
        assertThat(normal).isBetween(250.0, 320.0);    // v²/2g with v = 1230, g = 2600
        assertThat(lifted).isGreaterThan(normal * 1.6); // v = 1650
    }

    @Test
    void theUpdraftLaunchesANeighbourAndTheJetShoves() {
        var s = sim("bernoulli", "newton");
        s.place(0, 600, 0);
        s.place(1, 680, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        var hits = run(s, 20, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).y()).isGreaterThan(0);

        var jet = sim("bernoulli", "newton");
        jet.place(0, 400, 0);
        jet.place(1, 800, 0);
        jet.step(special2(), NONE);
        double vx = 0;
        for (int t = 0; t < 40; t++) {
            jet.step(NONE, NONE);
            if (jet.snapshot().events().stream().anyMatch(e -> e.type().equals(GameEvent.HIT))) { vx = v(jet, 1).vx(); break; }
        }
        assertThat(vx).isEqualTo(Math.round(72000 / 100.0 * 10) / 10.0); // J / m: a shove of 720 units/s from 30 damage
    }

    @Test
    void hurricaneDragsInAndLifts() {
        var s = sim("bernoulli", "newton");
        s.place(0, 300, 0);
        s.place(1, 760, 0);
        ultimate(s, 0);
        double startX = 760, maxY = 0;
        int hits = 0;
        for (int t = 0; t < EngineConstants.CINEMATIC_TICKS + 120; t++) {
            s.step(NONE, NONE);
            maxY = Math.max(maxY, v(s, 1).y());
            hits += (int) s.snapshot().events().stream().filter(e -> e.type().equals(GameEvent.HIT)).count();
        }
        assertThat(maxY).isGreaterThan(150);
        assertThat(hits).isGreaterThanOrEqualTo(3);
        assertThat(Math.abs(v(s, 1).x() - 600)).isLessThan(Math.abs(startX - 600)); // pulled toward the eye (x = 600)
    }

    // ------------------------------------------------------------------- Edison

    @Test
    void dcPunchKeepsHurtingUpCloseButNotThroughAFaradayCage() {
        var s = sim("edison", "newton");
        s.place(0, 500, 0);
        s.place(1, 600, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        assertThat(run(s, 60, GameEvent.HIT)).hasSizeGreaterThanOrEqualTo(3);

        var caged = sim("edison", "faraday");
        caged.place(0, 500, 0);
        caged.place(1, 600, 0);
        caged.step(NONE, press(InputBits.SPECIAL)); // Faraday raises his cage first
        run(caged, 12, GameEvent.HIT);
        caged.step(press(InputBits.SPECIAL), NONE);
        List<GameEvent> blocks = new ArrayList<>(), hits = new ArrayList<>();
        for (int t = 0; t < 60; t++) {
            caged.step(NONE, NONE);
            for (GameEvent e : caged.snapshot().events()) {
                if (e.type().equals(GameEvent.BLOCK)) blocks.add(e);
                if (e.type().equals(GameEvent.HIT)) hits.add(e);
            }
        }
        assertThat(blocks).hasSizeGreaterThanOrEqualTo(3);
        assertThat(hits).isEmpty();
    }

    @Test
    void lightbulbFlashDazzles() {
        var s = sim("edison", "curie");
        s.place(0, 500, 0);
        s.place(1, 610, 0);
        s.step(special2(), NONE);
        assertThat(run(s, 20, GameEvent.HIT)).hasSize(1);
        assertThat(v(s, 1).blind()).isGreaterThan(100);
        run(s, 20, GameEvent.HIT); // out of hitstun

        // Dazzled: Curie's special does nothing, and she doesn't turn to face Edison.
        s.step(NONE, press(InputBits.SPECIAL));
        assertThat(run(s, 20, GameEvent.CAST)).isEmpty();
        int facing = v(s, 1).facing();
        s.place(0, 900, 0);
        run(s, 5, GameEvent.HIT);
        assertThat(v(s, 1).facing()).isEqualTo(facing);

        run(s, 120, GameEvent.HIT);
        assertThat(v(s, 1).blind()).isZero();
        s.step(NONE, press(InputBits.SPECIAL));
        assertThat(run(s, 20, GameEvent.CAST)).hasSize(1);
        assertThat(v(s, 1).facing()).isEqualTo(1); // now facing Edison on her right
    }

    @Test
    void patentCopiesTheOpponentsLastSpecialAndLocksIt() {
        var s = sim("edison", "galileo");
        s.place(0, 1300, 0);
        s.place(1, 300, 0);
        s.step(NONE, press(InputBits.SPECIAL)); // Galileo swings his pendulum
        run(s, 30, GameEvent.HIT);
        assertThat(v(s, 1).last()).isEqualTo("special1");
        run(s, 80, GameEvent.HIT);

        ultimate(s, 0);
        var copies = run(s, EngineConstants.CINEMATIC_TICKS + move("edison", "ultimate").startup(), GameEvent.COPY);
        assertThat(copies).singleElement().satisfies(e -> assertThat(e.move()).isEqualTo("special1"));
        assertThat(s.snapshot().projectiles()).filteredOn(p -> p.kind().equals("pendulum"))
            .singleElement().satisfies(p -> assertThat(p.owner()).isZero()); // Edison's pendulum now
        assertThat(v(s, 1).cd1()).isGreaterThan(250);                        // patented: Galileo can't use it

        var nothing = sim("edison", "galileo");
        nothing.place(0, 600, 0);
        nothing.place(1, 760, 0);
        ultimate(nothing, 0);
        var hits = run(nothing, EngineConstants.CINEMATIC_TICKS + 30, GameEvent.HIT);
        assertThat(hits).singleElement().satisfies(h -> assertThat(h.damage()).isEqualTo(140)); // nothing to copy: a burst
    }

    // ------------------------------------------------------------------ S.N. Bose

    @Test
    void condensateFreezeChillsThenFreezesSolid() {
        var s = sim("sn-bose", "newton");
        s.place(0, 300, 0);
        s.place(1, 800, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        assertThat(run(s, 70, GameEvent.HIT)).hasSize(1);
        assertThat(v(s, 1).chill()).isGreaterThan(100);

        // Chilled, Newton acts on only half the ticks: he walks half as far (even his hitstun wears off at half speed).
        run(s, 40, GameEvent.HIT);
        double x0 = v(s, 1).x();
        run(s, 30, NONE, hold(InputBits.RIGHT), GameEvent.HIT);
        double walked = v(s, 1).x() - x0;
        assertThat(walked).isBetween(340 * 0.5 * 0.4, 340 * 0.5 * 0.6);

        s.place(1, 800, 0);
        run(s, 40, GameEvent.HIT); // cooldown
        s.step(press(InputBits.SPECIAL), NONE);
        var frozen = run(s, 70, GameEvent.FREEZE);
        assertThat(frozen).hasSize(1);
        assertThat(v(s, 1).chill()).isZero();
        assertThat(v(s, 1).stun()).isGreaterThan(50); // frozen solid
    }

    @Test
    void bosonCopyTakesOnTheOpponentsLastSpecial() {
        var s = sim("sn-bose", "einstein");
        s.place(0, 1300, 0);
        s.place(1, 300, 0);
        s.step(NONE, special2()); // Einstein's time-dilation bubble
        run(s, 20, GameEvent.HIT);
        s.step(special2(), NONE);
        var copies = run(s, 20, GameEvent.COPY);
        assertThat(copies).singleElement().satisfies(e -> assertThat(e.move()).isEqualTo("special2"));
        assertThat(s.snapshot().zones()).filteredOn(z -> z.kind().equals("BUBBLE")).extracting(ZoneView::owner).containsExactlyInAnyOrder(0, 1);

        // Two Boses can't copy each other's copies forever.
        var mirror = sim("sn-bose", "sn-bose");
        mirror.place(0, 300, 0);
        mirror.place(1, 1300, 0);
        mirror.step(special2(), NONE);
        run(mirror, 20, GameEvent.HIT);
        mirror.step(NONE, special2());
        assertThat(run(mirror, 20, GameEvent.COPY)).isEmpty();
    }

    @Test
    void boseEinsteinCondensateFreezesTheArena() {
        var s = sim("sn-bose", "curie", Arena.THE_LAB);
        s.place(0, 150, 0);
        s.place(1, 1450, 0);
        s.step(NONE, press(InputBits.SPECIAL)); // a radioactive orb on its way
        run(s, 20, GameEvent.HIT);
        assertThat(s.snapshot().projectiles()).isNotEmpty();
        ultimate(s, 0);
        var condensed = run(s, EngineConstants.CINEMATIC_TICKS + move("sn-bose", "ultimate").startup(), GameEvent.CONDENSE);
        assertThat(condensed).hasSize(1);
        assertThat(s.snapshot().projectiles()).isEmpty();
        assertThat(s.snapshot().objects()).allSatisfy(o -> assertThat(o.vx() + o.vy()).isZero());
        var hits = run(s, 10, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(v(s, 1).stun()).isGreaterThan(60);
    }

    // ------------------------------------------------------------------ J.C. Bose

    @Test
    void microwavesComeBackThroughTheWall() {
        var s = sim("jc-bose", "newton");
        s.place(0, 1400, 0);
        s.place(1, 1550, 0);
        s.step(press(InputBits.SPECIAL), NONE); // aimed right, at Newton…
        s.place(1, 300, 0);                      // …who is suddenly behind him
        var hits = run(s, 140, GameEvent.HIT);
        assertThat(hits).hasSize(1);             // it left through the right wall and came in from the left
        assertThat(hits.get(0).x()).isLessThan(400);
    }

    @Test
    void aFaradayCageStopsMicrowaves() {
        var s = sim("jc-bose", "faraday");
        s.place(0, 400, 0);
        s.place(1, 800, 0);
        s.step(NONE, press(InputBits.SPECIAL));
        run(s, 12, GameEvent.HIT);
        s.step(press(InputBits.SPECIAL), NONE);
        assertThat(run(s, 40, GameEvent.BLOCK)).hasSize(1);
        assertThat(v(s, 1).health()).isEqualTo(CATALOG.definition("faraday").maxHealth());
    }

    @Test
    void vinesGrabOnlyWhatMoves() {
        var s = sim("jc-bose", "newton");
        s.place(0, 400, 0);
        s.place(1, 630, 0);
        s.step(special2(), NONE);
        assertThat(run(s, 90, GameEvent.HIT)).isEmpty(); // Newton keeps perfectly still
        var hits = run(s, 10, NONE, hold(InputBits.RIGHT), GameEvent.HIT);
        assertThat(hits).hasSize(1);                     // the stimulus: it grabs him
        assertThat(v(s, 1).vx()).isLessThan(0);          // and drags him back toward its root
        assertThat(s.snapshot().zones()).isEmpty();
    }

    @Test
    void livingSignalMakesEveryPlantStrikeAtOnce() {
        var s = sim("jc-bose", "newton");
        s.place(0, 300, 0);
        s.place(1, 1200, 0);
        s.step(special2(), NONE);
        run(s, 40, GameEvent.HIT); // let the cast finish
        ultimate(s, 0);
        run(s, EngineConstants.CINEMATIC_TICKS + move("jc-bose", "ultimate").startup(), GameEvent.HIT);
        List<ZoneView> vines = s.snapshot().zones();
        assertThat(vines).hasSize(4).allSatisfy(z -> assertThat(z.kind()).isEqualTo("VINE"));
        int strikeAge = (int) move("jc-bose", "ultimate").param("strike", 24);
        var hits = run(s, strikeAge + 2, GameEvent.HIT);
        assertThat(hits).hasSize(1);
        assertThat(s.snapshot().zones()).isEmpty(); // all four struck together
    }

    // ------------------------------------------------------------ Heisenberg, arena

    @Test
    void heisenbergCantBePinnedDownByProjectiles() {
        int phased = 0, hit = 0;
        for (int burn = 0; burn < 80; burn++) {
            var s = sim("curie", "heisenberg");
            for (int i = 0; i < burn; i++) s.random(2);
            s.place(0, 400, 0);
            s.place(1, 800, 0);
            s.step(press(InputBits.SPECIAL), NONE);
            for (int t = 0; t < 100; t++) {
                s.step(NONE, NONE);
                for (GameEvent e : s.snapshot().events()) {
                    if (e.type().equals(GameEvent.PHASE)) phased++;
                    if (e.type().equals(GameEvent.HIT)) hit++;
                }
            }
        }
        assertThat(phased + hit).isEqualTo(80);
        assertThat(phased).isBetween(14, 34); // 30% of 80 = 24
    }

    @Test
    void curzonHallHasTerracottaPotsThatDontConduct() {
        var s = sim("tesla", "newton", Arena.CURZON_HALL);
        assertThat(s.snapshot().objects()).extracting(ObjectView::kind).containsExactly("pot", "pot");
        s.place(0, 200, 0);
        s.place(1, 1500, 0);
        s.step(press(InputBits.SPECIAL), NONE);
        assertThat(run(s, 90, GameEvent.ARC)).isEmpty(); // lightning doesn't chain through clay
    }

    static ProjectileView only(MatchSimulation s) { return s.snapshot().projectiles().get(0); }
}
