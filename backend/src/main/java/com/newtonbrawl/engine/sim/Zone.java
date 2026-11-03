package com.newtonbrawl.engine.sim;

/**
 * An area effect that lives for a while: time-dilation bubble, magnetic pull, glow trap, fission
 * blast, electric field, energy beam. Position is the box centre. Behaviour is chosen by
 * {@link #kind}; see {@code MatchSimulation#updateZones}.
 */
public final class Zone {
    /** Slows everything inside (except the owner) to {@link #timeScale}. */
    public static final String BUBBLE = "BUBBLE";
    /** Drags the opponent and metal objects toward the owner at {@link #strength} units/s. */
    public static final String PULL = "PULL";
    /** Armed after {@link #arm} ticks; the first time the opponent steps on it, it fires and disappears. */
    public static final String TRAP = "TRAP";
    /** Hits once during [delay, delay + active); knocks away from its centre. */
    public static final String BLAST = "BLAST";
    /** Hits once during [delay, delay + active); knocks in {@link #dir}. */
    public static final String BEAM = "BEAM";
    /** Strikes the opponent anywhere every {@link #interval} ticks. */
    public static final String FIELD = "FIELD";

    public final int id;
    public final int owner;
    public final String kind;
    public final String move;

    public double x, y, w, h;
    public int dir = 1;
    public int life = 60, age;
    public int delay, active = 1, arm, interval = 20;
    public int damage, hitstun, hitstop;
    public double impulseX, impulseY;
    public double strength, timeScale = 1.0;
    public boolean electric;
    int hitMask;
    boolean dead;

    public Zone(int id, int owner, String kind, String move) {
        this.id = id;
        this.owner = owner;
        this.kind = kind;
        this.move = move;
    }

    Aabb box() {
        return Aabb.centered(x, y, w, h);
    }

    boolean contains(double px, double py) {
        return Math.abs(px - x) <= w / 2 && Math.abs(py - y) <= h / 2;
    }

    ZoneView view() {
        return new ZoneView(id, owner, kind, move, MatchSimulation.r(x), MatchSimulation.r(y), w, h, age, life,
            delay, active, arm == 0);
    }
}
