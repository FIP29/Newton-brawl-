package com.newtonbrawl.engine.sim;

/**
 * A moving attack (apple, lightning bolt, radioactive orb, gravity wave…). A plain mutable struct
 * owned by the simulation; fighter classes fill it in and hand it to {@link MatchWorld#spawn(Projectile)}.
 * Position is the box centre.
 */
public final class Projectile {
    /**
     * Extra behaviour on hit. MEASURE (Heisenberg): the knockback's direction and size are random
     * (pinning down x leaves p uncertain). DOPPLER: damage scales with the observed frequency
     * f' = f·(c + v_o)/(c − v_s).
     */
    public enum Effect { NONE, GRAVITY_FLIP, BUOY, MEASURE, DOPPLER, CHILL }

    /**
     * How the projectile moves. LINEAR integrates velocity + acceleration. PENDULUM swings from a
     * pivot under θ'' = −(g/L)·θ. ORBIT circles its caster under a central force a = −ω²·r
     * (with ω chosen per moon so that T² ∝ r³, Kepler's third law). All three use only + − × ÷
     * so Java and JavaScript stay bit-identical.
     */
    public enum Motion { LINEAR, PENDULUM, ORBIT }

    public final int id;
    public int owner;
    public final String kind;
    public final String move;

    public double x, y, vx, vy, ax, ay, w = 30, h = 30;
    /** +1/-1: direction knockback is applied in. */
    public int dir = 1;
    public int damage, hitstun, hitstop;
    public double impulseX, impulseY;
    public int life = 120, age;
    /** If > 0, damage halves every {@code halfLife} ticks (radioactive decay). */
    public int halfLife;
    public boolean electric;
    public int chains, maxChains, lastChainObject = -1;
    public Effect effect = Effect.NONE;
    public int effectTicks;
    public boolean reflected;
    public Motion motion = Motion.LINEAR;
    // PENDULUM
    public double pivotX, pivotY, length, theta, omega, gOverL;
    // ORBIT (offsets relative to the anchor fighter's chest)
    public int anchor = -1;
    public double ox, oy, ovx, ovy, k;
    /** Evaporating black hole (Hawking): size shrinks by {@code shrink} per tick down to {@code minSize}; damage ∝ size0 / size. */
    public double shrink, size0, minSize;
    /** DOPPLER: wave speed c and the source's velocity toward the target at emission, v_s. */
    public double waveSpeed, vs;
    /** CHILL: hitstun when it lands on an already-chilled target (frozen solid). */
    public int freezeStun;
    /** Times it may pass through a side wall and reappear on the other side (J.C. Bose's microwaves). */
    public int wraps;
    /** Passed through an evasive fighter (Heisenberg) and can no longer hit them. */
    boolean evaded;
    boolean dead;

    public Projectile(int id, int owner, String kind, String move) {
        this.id = id;
        this.owner = owner;
        this.kind = kind;
        this.move = move;
    }

    Aabb box() {
        return Aabb.centered(x, y, w, h);
    }

    /**
     * Damage after decay. Half-life is computed with only + − × ÷ (no pow) so Java and JavaScript
     * agree bit-for-bit: exact halving every half-life, linear in between.
     */
    public int currentDamage() {
        if (size0 > 0) return (int) Math.round(damage * size0 / w); // hotter as it shrinks: T ∝ 1/M
        if (halfLife <= 0) return damage;
        int n = Math.min(age / halfLife, 30);
        double frac = (double) (age % halfLife) / halfLife;
        double f = 1.0;
        for (int i = 0; i < n; i++) f *= 0.5;
        f *= 1.0 - frac * 0.5;
        return (int) Math.round(damage * f);
    }

    ProjectileView view() {
        return new ProjectileView(id, owner, kind, move, MatchSimulation.r(x), MatchSimulation.r(y),
            MatchSimulation.r(vx), MatchSimulation.r(vy), w, h, currentDamage(), age, chains, reflected,
            MatchSimulation.r(pivotX), MatchSimulation.r(pivotY));
    }
}
