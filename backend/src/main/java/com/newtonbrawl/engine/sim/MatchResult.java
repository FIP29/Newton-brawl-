package com.newtonbrawl.engine.sim;

import java.util.List;

/**
 * Outcome of a match.
 *
 * @param winner    slot 0/1, or -1 for a draw / aborted match
 * @param roundWins rounds won by each slot
 */
public record MatchResult(int winner, Reason reason, long ticks, List<Integer> roundWins) {
    public enum Reason {
        /** Won on rounds (best of 3). */
        DECISION,
        FORFEIT,
        ABORTED
    }

    public MatchResult {
        roundWins = roundWins == null ? List.of(0, 0) : List.copyOf(roundWins);
    }

    public boolean isDraw() {
        return winner < 0;
    }
}
