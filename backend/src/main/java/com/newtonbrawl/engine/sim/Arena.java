package com.newtonbrawl.engine.sim;

/**
 * Stage parameters that affect physics. Later arenas vary gravity (Space Station) or add a
 * central pull (Black Hole Edge).
 *
 * @param gravity downward acceleration in units/s² (exaggerated vs. real 980 for snappy jumps)
 */
public record Arena(String id, double width, double gravity) {
    public static final Arena THE_LAB = new Arena("the-lab", 1600, 2600);
}
