package com.newtonbrawl.engine.runtime;

import com.newtonbrawl.engine.sim.MatchResult;
import com.newtonbrawl.engine.sim.MatchSnapshot;

/**
 * Callbacks from a running match. Invoked on the match's own thread, so implementations must be
 * thread-safe and fast (no blocking I/O beyond queuing network sends).
 */
public interface MatchListener {

    /**
     * @param ackedSeq per slot, the sequence number of the last input applied this tick
     */
    void onTick(MatchSnapshot snapshot, long[] ackedSeq);

    /** Called exactly once, after which the runner is stopped. */
    void onMatchEnd(MatchResult result);
}
