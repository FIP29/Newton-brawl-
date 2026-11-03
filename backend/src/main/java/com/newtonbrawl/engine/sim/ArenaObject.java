package com.newtonbrawl.engine.sim;

/**
 * A physical prop (lab beaker). Hit it to send it flying into the opponent, magnetise it with
 * Tesla's pull, or chain lightning through it (metal).
 */
public final class ArenaObject {
    public final int id;
    public final String kind;
    public final boolean metal;
    public double x, y, vx, vy;
    public final double w, h;
    /** Slot that last sent it flying (it can hurt the other slot), or -1. */
    public int owner = -1;

    public ArenaObject(int id, String kind, boolean metal, double x, double w, double h) {
        this.id = id;
        this.kind = kind;
        this.metal = metal;
        this.x = x;
        this.w = w;
        this.h = h;
    }

    Aabb box() {
        return new Aabb(x - w / 2, y, w, h);
    }

    /** Melee reach: props sit on the floor, so attacks test against a taller box (you can kick or swat them). */
    static final double INTERACT_HEIGHT = 140;

    Aabb interactBox() {
        return new Aabb(x - w / 2, y, w, Math.max(h, INTERACT_HEIGHT));
    }

    double centerY() {
        return y + h / 2;
    }

    ObjectView view() {
        return new ObjectView(id, kind, MatchSimulation.r(x), MatchSimulation.r(y), MatchSimulation.r(vx),
            MatchSimulation.r(vy), w, h, owner);
    }
}
