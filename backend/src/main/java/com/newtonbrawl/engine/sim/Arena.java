package com.newtonbrawl.engine.sim;

import java.util.List;

/**
 * Stage parameters that affect physics. Later arenas vary gravity (Space Station) or add a
 * central pull (Black Hole Edge).
 *
 * @param gravity       downward acceleration in units/s² (exaggerated vs. real 980 for snappy jumps)
 * @param height        ceiling height (relevant when gravity is flipped)
 * @param objectSpawns  x positions of throwable metal objects placed at the start of each round
 */
public record Arena(String id, double width, double height, double gravity, List<Double> objectSpawns) {

    public Arena {
        objectSpawns = objectSpawns == null ? List.of() : List.copyOf(objectSpawns);
    }

    /** The Lab: conductive metal beakers on the floor (Tesla's lightning chains through them). */
    public static final Arena THE_LAB = new Arena("the-lab", 1600, 900, 2600, List.of(250.0, 800.0, 1350.0));
}
