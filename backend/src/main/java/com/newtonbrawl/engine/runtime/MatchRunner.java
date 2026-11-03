package com.newtonbrawl.engine.runtime;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.input.InputQueue;
import com.newtonbrawl.engine.sim.MatchPhase;
import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.engine.sim.MatchSimulation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReferenceArray;

/**
 * Drives one {@link MatchSimulation} at a fixed 60 Hz on a dedicated thread.
 *
 * <p>Threading: network threads only call {@link #submitInput} (lock-free queue) and
 * {@link #forfeit}/{@link #abort} (marshalled onto the match thread). All simulation state is
 * touched by the match thread alone, so the simulation itself needs no synchronisation.
 */
public final class MatchRunner {

    private static final Logger log = LoggerFactory.getLogger(MatchRunner.class);

    private final String matchId;
    private final MatchSimulation sim;
    private final MatchListener listener;
    private final AtomicReferenceArray<InputQueue> inputs =
        new AtomicReferenceArray<>(new InputQueue[] {new InputQueue(), new InputQueue()});
    private final ScheduledExecutorService thread;
    private final AtomicBoolean started = new AtomicBoolean();
    private final AtomicBoolean ended = new AtomicBoolean();

    public MatchRunner(String matchId, MatchSimulation sim, MatchListener listener) {
        this.matchId = matchId;
        this.sim = sim;
        this.listener = listener;
        this.thread = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "match-" + matchId);
            t.setDaemon(true);
            t.setPriority(Thread.NORM_PRIORITY + 1);
            return t;
        });
    }

    public void start() {
        if (!started.compareAndSet(false, true)) return;
        thread.scheduleAtFixedRate(this::safeTick, 0, EngineConstants.NANOS_PER_TICK, TimeUnit.NANOSECONDS);
    }

    /** Thread-safe; called from network threads. */
    public void submitInput(int slot, long seq, int bits) {
        if (slot == 0 || slot == 1) inputs.get(slot).offer(seq, bits);
    }

    /**
     * Starts a fresh input stream for a slot: all buttons released and sequence numbers reset.
     * Used when a player disconnects (so their fighter doesn't keep walking) and on reconnect
     * (the new connection numbers its inputs from zero again).
     */
    public void resetInput(int slot) {
        if (slot == 0 || slot == 1) inputs.set(slot, new InputQueue());
    }

    /** The given slot leaves: the other slot wins. */
    public void forfeit(int slot) {
        runOnMatchThread(() -> end(new MatchResult(1 - slot, MatchResult.Reason.FORFEIT, sim.tick(), sim.roundWinsList())));
    }

    /** Stop without a winner (e.g. server shutdown). */
    public void abort() {
        runOnMatchThread(() -> end(new MatchResult(-1, MatchResult.Reason.ABORTED, sim.tick(), sim.roundWinsList())));
    }

    public boolean isEnded() {
        return ended.get();
    }

    public String matchId() {
        return matchId;
    }

    private void runOnMatchThread(Runnable r) {
        if (ended.get()) return;
        try {
            thread.execute(r);
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // already shut down
        }
    }

    private void safeTick() {
        if (ended.get()) return;
        try {
            tick();
        } catch (Throwable t) {
            // An exception would silently cancel the fixed-rate task; end the match visibly instead.
            log.error("Match {} crashed on tick {}", matchId, sim.tick(), t);
            end(new MatchResult(-1, MatchResult.Reason.ABORTED, sim.tick(), sim.roundWinsList()));
        }
    }

    private void tick() {
        InputQueue q0 = inputs.get(0), q1 = inputs.get(1);
        sim.step(q0.next(), q1.next());
        listener.onTick(sim.snapshot(), new long[] {q0.lastAppliedSeq(), q1.lastAppliedSeq()});
        if (sim.phase() == MatchPhase.FINISHED) end(sim.result());
    }

    private void end(MatchResult result) {
        if (!ended.compareAndSet(false, true)) return;
        thread.shutdown();
        try {
            listener.onMatchEnd(result);
        } catch (Throwable t) {
            log.error("Match {} end handler failed", matchId, t);
        }
    }
}
