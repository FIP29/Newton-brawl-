package com.newtonbrawl.engine.sim;

/** What a fighter is doing this tick. Drives both the state machine and client animation. */
public enum Action {
    IDLE, WALK, CROUCH, AIRBORNE, ATTACK, HITSTUN, KO;

    /** True if the fighter accepts new movement/attack input. */
    public boolean isFree() {
        return this == IDLE || this == WALK || this == CROUCH || this == AIRBORNE;
    }
}
