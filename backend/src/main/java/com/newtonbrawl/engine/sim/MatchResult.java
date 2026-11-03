package com.newtonbrawl.engine.sim;

/**
 * Outcome of a match.
 *
 * @param winner slot 0/1, or -1 for a draw / aborted match
 */
public record MatchResult(int winner, Reason reason, long ticks) {
    public enum Reason { KO, DOUBLE_KO, FORFEIT, ABORTED }

    public boolean isDraw() {
        return winner < 0;
    }
}
