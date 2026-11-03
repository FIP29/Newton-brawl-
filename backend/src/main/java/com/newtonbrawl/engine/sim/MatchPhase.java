package com.newtonbrawl.engine.sim;

public enum MatchPhase {
    /** "FIGHT!" intro; fighters can't act yet. */
    COUNTDOWN,
    FIGHTING,
    /** Someone is down; physics keeps running for the KO slow-mo, inputs are ignored. */
    KO,
    FINISHED
}
