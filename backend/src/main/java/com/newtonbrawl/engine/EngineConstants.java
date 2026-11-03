package com.newtonbrawl.engine;

/**
 * Global simulation constants.
 *
 * <p>World units: 100 units ≈ 1 metre. +x is right, +y is up, the floor is y = 0.
 * Fighter positions are the centre-bottom (feet) of their body box.
 */
public final class EngineConstants {
    private EngineConstants() {}

    public static final int TICK_RATE = 60;
    public static final double DT = 1.0 / TICK_RATE;
    public static final long NANOS_PER_TICK = 1_000_000_000L / TICK_RATE;

    /** Velocity multiplier applied each tick on the ground when a fighter isn't driving its own movement. */
    public static final double GROUND_FRICTION = 0.82;

    /** Energy meter: fills by dealing and taking damage; a full meter enables the ULTIMATE (Phase 4). */
    public static final int ENERGY_MAX = 1000;
    public static final double ENERGY_PER_DAMAGE_DEALT = 1.0;
    public static final double ENERGY_PER_DAMAGE_TAKEN = 0.6;
}
