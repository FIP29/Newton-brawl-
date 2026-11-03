package com.newtonbrawl.engine.sim;

import java.util.List;

/**
 * Complete authoritative state after a tick.
 *
 * @param phaseTicks ticks remaining in the current timed phase (round intro/end), else 0
 * @param hitstop    ticks of world freeze remaining
 * @param timer      round clock in ticks
 * @param lastRound  result of the most recently finished round (null before the first ends)
 * @param events     things that happened during this tick only
 */
public record MatchSnapshot(long tick, MatchPhase phase, int phaseTicks, int hitstop,
                            int round, List<Integer> roundWins, int timer, RoundResult lastRound,
                            List<FighterView> fighters, List<HitEvent> events) {}
