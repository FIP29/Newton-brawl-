package com.newtonbrawl.engine.sim;

import java.util.List;

/**
 * Complete authoritative state after a tick.
 *
 * @param phaseTicks ticks remaining in the current timed phase (countdown/KO), else 0
 * @param hitstop    ticks of world freeze remaining
 * @param events     things that happened during this tick only
 */
public record MatchSnapshot(long tick, MatchPhase phase, int phaseTicks, int hitstop,
                            List<FighterView> fighters, List<HitEvent> events) {}
