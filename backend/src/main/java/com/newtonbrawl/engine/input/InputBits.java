package com.newtonbrawl.engine.input;

/**
 * Button bitmask shared with the client ({@code frontend/src/game/protocol.ts} mirrors these values).
 * One int describes everything a player is holding on a given tick.
 */
public final class InputBits {
    private InputBits() {}

    public static final int LEFT = 1;
    public static final int RIGHT = 1 << 1;
    public static final int UP = 1 << 2;
    public static final int DOWN = 1 << 3;
    public static final int LIGHT = 1 << 4;
    public static final int HEAVY = 1 << 5;
    public static final int SPECIAL = 1 << 6;
    /** Dedicated ULTIMATE button (HEAVY + SPECIAL together also works). */
    public static final int ULTIMATE = 1 << 7;

    /** All defined bits; anything else a client sends is masked off. */
    public static final int ALL = (1 << 8) - 1;

    public static boolean has(int bits, int button) {
        return (bits & button) != 0;
    }
}
