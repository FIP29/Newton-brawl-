package com.newtonbrawl.engine.input;

import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-player input buffer between the network thread (producer) and the match thread (consumer).
 *
 * <p>The client samples its controls once per client tick and sends {@code (seq, bits)}. The server
 * consumes exactly one entry per simulation tick, so a quick tap is never lost between ticks and
 * the server and client agree on which input was applied when. This is what client-side
 * prediction/reconciliation (Phase 3) relies on: each snapshot acknowledges the last applied seq.
 *
 * <ul>
 *   <li>Queue empty (packet late): repeat the last held buttons, with no new presses.</li>
 *   <li>Queue too long (client running ahead / burst after a stall): drop the oldest entries, but
 *       keep any button presses they contained so attacks aren't swallowed.</li>
 * </ul>
 */
public final class InputQueue {

    /** Maximum entries kept; beyond this the oldest are collapsed. ~100 ms at 60 Hz. */
    static final int MAX_BUFFERED = 6;

    /** Hard cap on pending entries so a flooding client can't grow memory between ticks. */
    static final int HARD_CAP = 64;

    private record Pending(long seq, int bits) {}

    private final ConcurrentLinkedQueue<Pending> queue = new ConcurrentLinkedQueue<>();
    private final AtomicInteger size = new AtomicInteger();
    private final AtomicLong highestOffered = new AtomicLong(-1);
    private volatile long lastAppliedSeq = -1;

    // Only touched by the consuming (match) thread.
    private int lastBits;

    /** Called from the network thread. Duplicates and out-of-order packets are ignored. */
    public void offer(long seq, int bits) {
        long prev;
        do {
            prev = highestOffered.get();
            if (seq <= prev) return;
        } while (!highestOffered.compareAndSet(prev, seq));
        if (size.incrementAndGet() > HARD_CAP) {
            size.decrementAndGet();
            return;
        }
        queue.add(new Pending(seq, bits & InputBits.ALL));
    }

    /** Called from the match thread once per tick. */
    public InputFrame next() {
        int carriedPresses = 0;
        while (size.get() > MAX_BUFFERED) {
            Pending dropped = queue.poll();
            if (dropped == null) break;
            size.decrementAndGet();
            carriedPresses |= dropped.bits & ~lastBits;
            lastBits = dropped.bits;
            lastAppliedSeq = dropped.seq;
        }
        Pending p = queue.poll();
        int bits = lastBits;
        if (p != null) {
            size.decrementAndGet();
            bits = p.bits;
            lastAppliedSeq = p.seq;
        }
        int pressed = (bits & ~lastBits) | carriedPresses;
        lastBits = bits;
        return new InputFrame(bits, pressed);
    }

    /** Sequence number of the newest input that has been applied to the simulation. */
    public long lastAppliedSeq() {
        return lastAppliedSeq;
    }
}
