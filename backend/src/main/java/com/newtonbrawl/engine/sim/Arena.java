package com.newtonbrawl.engine.sim;

import java.util.List;
import java.util.Map;

/**
 * Stage parameters that affect physics. {@code frontend/src/game/sim/constants.ts} mirrors ARENAS.
 *
 * @param gravity        downward acceleration on fighters in units/s² (exaggerated vs. real 980 for snappy jumps)
 * @param height         ceiling height
 * @param objectGravity  multiplier on gravity for props (0 = they float in zero-g)
 * @param bounce         restitution off the floor/ceiling
 * @param wallBounce     restitution off the side walls
 * @param objects        props placed at the start of each round
 */
public record Arena(String id, String name, double width, double height, double gravity,
                    double objectGravity, double bounce, double wallBounce, List<ObjectSpawn> objects) {

    /** A prop's starting state. {@code metal} props conduct Tesla's lightning and answer to magnetism. */
    public record ObjectSpawn(String kind, double x, double y, double vx, double vy, double w, double h, boolean metal) {}

    public Arena {
        objects = objects == null ? List.of() : List.copyOf(objects);
    }

    /** The Lab: conductive metal beakers on the floor (Tesla's lightning chains through them). */
    public static final Arena THE_LAB = new Arena("the-lab", "The Lab", 1600, 900, 2600, 1, 0.45, 0.6, List.of(
        new ObjectSpawn("beaker", 250, 0, 0, 0, 36, 56, true),
        new ObjectSpawn("beaker", 800, 0, 0, 0, 36, 56, true),
        new ObjectSpawn("beaker", 1350, 0, 0, 0, 36, 56, true)));

    /**
     * Space Station: low gravity (jumps hang in the air) and drifting zero-g debris that bounces off
     * every surface. Punch it and it becomes a projectile.
     */
    public static final Arena SPACE_STATION = new Arena("space-station", "Space Station", 1600, 900, 1100, 0, 0.85, 0.85, List.of(
        new ObjectSpawn("crate", 300, 420, 30, 12, 60, 60, true),
        new ObjectSpawn("panel", 760, 610, -24, 16, 84, 30, true),
        new ObjectSpawn("wrench", 1060, 300, 20, -14, 70, 24, true),
        new ObjectSpawn("crate", 1330, 520, -28, -10, 60, 60, true)));

    public static final List<Arena> ALL = List.of(THE_LAB, SPACE_STATION);
    private static final Map<String, Arena> BY_ID = Map.of(THE_LAB.id(), THE_LAB, SPACE_STATION.id(), SPACE_STATION);

    public static Arena byId(String id) {
        Arena a = BY_ID.get(id);
        if (a == null) throw new IllegalArgumentException("Unknown arena: " + id);
        return a;
    }
}
