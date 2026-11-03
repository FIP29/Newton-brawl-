package com.newtonbrawl.engine.sim;

/**
 * A moving attack (apple, lightning bolt, radioactive orb, gravity wave…). A plain mutable struct
 * owned by the simulation; fighter classes fill it in and hand it to {@link MatchWorld#spawn(Projectile)}.
 * Position is the box centre.
 */
public final class Projectile {
    public enum Effect { NONE, GRAVITY_FLIP }

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
            MatchSimulation.r(vx), MatchSimulation.r(vy), w, h, currentDamage(), age, chains, reflected);
    }
}
