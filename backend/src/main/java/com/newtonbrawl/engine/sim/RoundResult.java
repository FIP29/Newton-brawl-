package com.newtonbrawl.engine.sim;

/**
 * How a round ended.
 *
 * @param winner slot 0/1, or -1 for a drawn round (double KO or equal health at time-out)
 */
public record RoundResult(int round, int winner, Reason reason) {
    public enum Reason { KO, DOUBLE_KO, TIME }
}
