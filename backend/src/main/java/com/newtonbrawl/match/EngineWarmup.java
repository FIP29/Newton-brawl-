package com.newtonbrawl.match;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.FighterCatalog;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;
import com.newtonbrawl.engine.sim.Arena;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchRules;
import com.newtonbrawl.engine.sim.MatchSimulation;
import com.newtonbrawl.match.protocol.ServerMessages;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.SplittableRandom;

/**
 * Plays short bot matches for every fighter, ULTIMATEs included, in the background right after
 * startup, and encodes each snapshot as the match loop would.
 *
 * <p>Why: a cold JVM runs a code path slowly the first time (class loading, then JIT). On a small
 * hosted CPU (Render's free plan gives 0.15 of a core) the first real match paid for that: ticks
 * stalled for tens of milliseconds the first time each ULTIMATE or special fired, so snapshots
 * arrived in clumps and the fight stuttered. After warm-up those paths are already compiled.
 * It stops early if a real match starts, so players never compete with it for CPU.
 */
@Component
@ConditionalOnProperty(name = "newton-brawl.warmup.enabled", havingValue = "true", matchIfMissing = true)
public class EngineWarmup {

    private static final Logger log = LoggerFactory.getLogger(EngineWarmup.class);
    private static final int TICKS_PER_MATCH = 420;

    private final FighterCatalog catalog;
    private final ObjectMapper mapper;
    private final RoomService rooms;

    public EngineWarmup(FighterCatalog catalog, ObjectMapper mapper, RoomService rooms) {
        this.catalog = catalog;
        this.mapper = mapper;
        this.rooms = rooms;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        Thread t = new Thread(this::run, "engine-warmup");
        t.setDaemon(true);
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    void run() {
        long started = System.nanoTime();
        List<String> ids = catalog.all().stream().map(FighterDefinition::id).filter(id -> !id.equals("prototype")).toList();
        SplittableRandom rng = new SplittableRandom(1687);
        long[] ack = {0, 0};
        int matches = 0;
        try {
            for (int i = 0; i < ids.size(); i++) {
                if (rooms.anyMatchRunning()) { log.info("Engine warm-up stopped early: a match started"); return; }
                Arena arena = Arena.ALL.get(i % Arena.ALL.size());
                MatchSimulation sim = new MatchSimulation(arena, catalog.create(ids.get(i)),
                    catalog.create(ids.get((i + 5) % ids.size())), MatchRules.STANDARD.withCountdown(0));
                int[] prev = {0, 0};
                for (int tick = 0; tick < TICKS_PER_MATCH && sim.phase() != MatchPhase.FINISHED; tick++) {
                    if (tick % 140 == 0) { sim.setEnergy(0, EngineConstants.ENERGY_MAX); sim.setEnergy(1, EngineConstants.ENERGY_MAX); }
                    sim.step(input(sim, 0, rng, prev), input(sim, 1, rng, prev));
                    mapper.writeValueAsString(new ServerMessages.State(sim.snapshot(), ack));
                }
                matches++;
            }
            log.info("Engine warm-up: {} bot matches in {} ms", matches, (System.nanoTime() - started) / 1_000_000);
        } catch (Exception e) {
            log.warn("Engine warm-up failed (harmless): {}", e.toString());
        }
    }

    /** Walk toward the other fighter and mash a bit: enough to fire every move, special and ULTIMATE. */
    private static InputFrame input(MatchSimulation sim, int slot, SplittableRandom rng, int[] prev) {
        if (sim.phase() != MatchPhase.FIGHTING) { prev[slot] = 0; return InputFrame.NONE; }
        double dx = sim.fighter(1 - slot).x() - sim.fighter(slot).x();
        int bits = Math.abs(dx) > 140 ? (dx > 0 ? InputBits.RIGHT : InputBits.LEFT) : 0;
        double roll = rng.nextDouble();
        if (roll < 0.05) bits |= InputBits.ULTIMATE;
        else if (roll < 0.10) bits |= InputBits.SPECIAL;
        else if (roll < 0.14) bits |= InputBits.SPECIAL | InputBits.DOWN;
        else if (roll < 0.30) bits |= rng.nextBoolean() ? InputBits.LIGHT : InputBits.HEAVY;
        else if (roll < 0.32) bits |= InputBits.UP;
        InputFrame f = new InputFrame(bits, bits & ~prev[slot]);
        prev[slot] = bits;
        return f;
    }
}
