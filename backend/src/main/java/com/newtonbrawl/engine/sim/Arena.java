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
 * @param well           a point mass (black hole) whose gravity bends projectiles and keeps props in orbit, or null
 */
public record Arena(String id, String name, double width, double height, double gravity,
                    double objectGravity, double bounce, double wallBounce, List<ObjectSpawn> objects, Well well) {

    /** A prop's starting state. {@code metal} props conduct Tesla's lightning and answer to magnetism. */
    public record ObjectSpawn(String kind, double x, double y, double vx, double vy, double w, double h, boolean metal) {}

    /**
     * A gravity well. Props and projectiles accelerate toward (x, y) with a = GM / (r² + soft²)
     * (softened inverse-square law); anything that falls inside {@code core} is swallowed (props
     * respawn). Fighters, standing on a platform, only feel a slow tidal {@code drift} toward it.
     */
    public record Well(double x, double y, double gm, double soft, double core, double drift) {}

    public Arena {
        objects = objects == null ? List.of() : List.copyOf(objects);
    }

    /** An arena without a gravity well. */
    public Arena(String id, String name, double width, double height, double gravity,
                 double objectGravity, double bounce, double wallBounce, List<ObjectSpawn> objects) {
        this(id, name, width, height, gravity, objectGravity, bounce, wallBounce, objects, null);
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

    /**
     * Black Hole Edge: a platform at the edge of a black hole. Rocks orbit it (inverse-square
     * gravity: the two near-circular orbits move at v = √(a·r)), projectiles curve toward it, and
     * fighters drift slowly toward the middle. Rocks that fall in are swallowed and reappear.
     */
    public static final Arena BLACK_HOLE_EDGE = new Arena("black-hole-edge", "Black Hole Edge", 1600, 900, 2200, 0, 0.7, 0.7, List.of(
        new ObjectSpawn("rock", 1000, 407, 0, 235, 52, 46, false),
        new ObjectSpawn("rock", 600, 410, 0, -235, 46, 40, false),
        new ObjectSpawn("rock", 800, 205, 200, 0, 58, 50, false)),
        new Well(800, 430, 12_000_000, 60, 48, 45));

    public static final List<Arena> ALL = List.of(THE_LAB, SPACE_STATION, BLACK_HOLE_EDGE);
    private static final Map<String, Arena> BY_ID = Map.of(THE_LAB.id(), THE_LAB, SPACE_STATION.id(), SPACE_STATION,
        BLACK_HOLE_EDGE.id(), BLACK_HOLE_EDGE);

    public static Arena byId(String id) {
        Arena a = BY_ID.get(id);
        if (a == null) throw new IllegalArgumentException("Unknown arena: " + id);
        return a;
    }
}
