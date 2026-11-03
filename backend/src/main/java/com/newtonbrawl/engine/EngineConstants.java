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

    /** Real gravitational acceleration, 9.8 m/s², in world units (100 units = 1 m). Newton's apples use it. */
    public static final double REAL_G = 980;
    /** While gravity is flipped a fighter "falls" upwards at this fraction of normal gravity. */
    public static final double FLIP_GRAVITY = -0.35;
    /** Buoyancy: a floating fighter rises gently at this fraction of gravity (pointing up). */
    public static final double BUOY_GRAVITY = -0.12;
    /** World freeze while an ULTIMATE's cinematic plays. */
    public static final int CINEMATIC_TICKS = 60;
    /** Arena objects (lab beakers) respond to impulses as if they had this mass. */
    public static final double OBJECT_MASS = 50;
    /** A thrown/knocked object faster than this (|vx|+|vy|) hurts the opponent of whoever sent it flying. */
    public static final double OBJECT_DANGER_SPEED = 500;
    /** Final-KO slow motion: the first N ticks of the deciding round's end run at 1/3 speed. */
    public static final int SLOWMO_TICKS = 90;
}
