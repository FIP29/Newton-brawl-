package com.newtonbrawl.engine.sim;

public enum MatchPhase {
    /** "ROUND n — FIGHT!" intro; fighters can't act yet. */
    ROUND_START,
    FIGHTING,
    /** Round decided (KO or time); physics keeps running for the slow-mo, inputs are ignored. */
    ROUND_END,
    FINISHED
}
