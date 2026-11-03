package com.newtonbrawl.engine.sim;

import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;

/**
 * Mutable per-fighter simulation state. Owned and mutated only by {@link MatchSimulation}
 * on the match thread; everything else sees {@link FighterView} copies.
 */
public final class FighterState {

    /** Crouching shrinks the hurtbox to this fraction of standing height. */
    static final double CROUCH_HEIGHT = 0.6;

    final int slot;
    final Fighter fighter;
    final FighterDefinition def;

    double x, y, vx, vy;
    int facing;
    int health;
    int energy;
    boolean grounded = true;

    Action action = Action.IDLE;
    String moveId;
    MoveDefinition move;
    int moveFrame;
    boolean moveConnected;
    int stunTicks;

    /** Attack presses made while busy, replayed once free (see {@link #INPUT_BUFFER_TICKS}). */
    int bufferedPresses;
    int bufferAge;

    // Status effects and timers.
    int flipTicks;
    /** Archimedes' Buoyancy Bubble: floats up helplessly (no control). */
    int buoyTicks;
    /** Faraday Cage: immune to electric attacks. */
    int cageTicks;
    /** Heisenberg's Uncertainty Principle: left and right are swapped. */
    int scrambleTicks;
    int reflectTicks;
    int invulnTicks;
    final int[] cooldowns = new int[2];
    /** Time-dilation accumulator: the fighter only acts on ticks where this reaches 1. */
    double timeAcc;
    /** Arena objects the current move has already hit (bit per object index). */
    int objHitMask;

    /** How long a press made while busy stays valid. Makes chaining attacks feel responsive. */
    static final int INPUT_BUFFER_TICKS = 6;

    FighterState(int slot, Fighter fighter, double x, int facing) {
        this.slot = slot;
        this.fighter = fighter;
        this.def = fighter.definition();
        this.x = x;
        this.facing = facing;
        this.health = def.maxHealth();
    }

    /** Back to the starting line for a new round. Energy carries over between rounds. */
    void resetForRound(double startX, int startFacing) {
        x = startX;
        y = 0;
        vx = 0;
        vy = 0;
        facing = startFacing;
        health = def.maxHealth();
        grounded = true;
        action = Action.IDLE;
        clearMove();
        stunTicks = 0;
        bufferedPresses = 0;
        bufferAge = 0;
        flipTicks = 0;
        buoyTicks = 0;
        cageTicks = 0;
        scrambleTicks = 0;
        reflectTicks = 0;
        invulnTicks = 0;
        cooldowns[0] = 0;
        cooldowns[1] = 0;
        timeAcc = 0;
        objHitMask = 0;
    }

    void addEnergy(double amount) {
        energy = (int) Math.min(com.newtonbrawl.engine.EngineConstants.ENERGY_MAX, energy + Math.round(amount));
    }

    double halfWidth() {
        return def.body().width() / 2;
    }

    /** Where this fighter can be hit. */
    Aabb hurtbox() {
        double h = def.body().height() * (action == Action.CROUCH ? CROUCH_HEIGHT : 1.0);
        return new Aabb(x - halfWidth(), y, def.body().width(), h);
    }

    /** The current move's hitbox in world space, or null if not in active frames. */
    Aabb activeHitbox() {
        if (action != Action.ATTACK || move == null || move.hitbox() == null || moveConnected
                || !move.isActiveOn(moveFrame)) {
            return null;
        }
        FighterDefinition.Box b = move.hitbox();
        return Aabb.centered(x + facing * b.x(), y + b.y(), b.w(), b.h());
    }

    void startMove(String id) {
        MoveDefinition m = def.move(id);
        if (m == null) return;
        moveId = id;
        move = m;
        moveFrame = 0;
        moveConnected = false;
        objHitMask = 0;
        action = Action.ATTACK;
    }

    /** Remember attack presses made while unable to act. */
    void bufferPresses(int pressed) {
        int attacks = pressed & (com.newtonbrawl.engine.input.InputBits.LIGHT
            | com.newtonbrawl.engine.input.InputBits.HEAVY
            | com.newtonbrawl.engine.input.InputBits.SPECIAL
            | com.newtonbrawl.engine.input.InputBits.ULTIMATE);
        if (attacks != 0) {
            bufferedPresses = attacks;
            bufferAge = 0;
        } else if (bufferedPresses != 0 && ++bufferAge > INPUT_BUFFER_TICKS) {
            bufferedPresses = 0;
        }
    }

    /** Returns and clears any still-valid buffered presses. */
    int takeBufferedPresses() {
        int p = bufferedPresses;
        bufferedPresses = 0;
        return p;
    }

    void clearMove() {
        moveId = null;
        move = null;
        moveFrame = 0;
        moveConnected = false;
    }

    FighterView view() {
        return new FighterView(r(x), r(y), r(vx), r(vy), facing, health, energy, action, moveId, moveFrame,
            grounded, stunTicks, moveConnected, bufferedPresses, bufferAge,
            flipTicks, reflectTicks, invulnTicks, cooldowns[0], cooldowns[1], r(timeAcc), objHitMask, buoyTicks, cageTicks, scrambleTicks);
    }

    private static double r(double v) {
        return MatchSimulation.r(v);
    }

    // ---- API for fighter behaviour classes (engine.fighter.roster) ----

    public int facing() { return facing; }
    public double bodyHeight() { return def.body().height(); }
    public FighterDefinition definition() { return def; }
    public void setReflectTicks(int ticks) { reflectTicks = ticks; }
    public void setInvulnTicks(int ticks) { invulnTicks = ticks; }
    public void setCageTicks(int ticks) { cageTicks = ticks; }
    public void setScrambleTicks(int ticks) { scrambleTicks = ticks; }
    public double vx() { return vx; }
    public boolean grounded() { return grounded; }

    public int slot() { return slot; }
    public int health() { return health; }
    public int energy() { return energy; }
    public double x() { return x; }
    public double y() { return y; }
    public Action action() { return action; }
}
