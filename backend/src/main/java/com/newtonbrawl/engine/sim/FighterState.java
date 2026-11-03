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
        if (action != Action.ATTACK || move == null || moveConnected || !move.isActiveOn(moveFrame)) {
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
        action = Action.ATTACK;
    }

    /** Remember attack presses made while unable to act. */
    void bufferPresses(int pressed) {
        int attacks = pressed & (com.newtonbrawl.engine.input.InputBits.LIGHT
            | com.newtonbrawl.engine.input.InputBits.HEAVY
            | com.newtonbrawl.engine.input.InputBits.SPECIAL);
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
        return new FighterView(r(x), r(y), r(vx), r(vy), facing, health, action, moveId, moveFrame, grounded);
    }

    private static double r(double v) {
        return Math.round(v * 10) / 10.0;
    }

    public int slot() { return slot; }
    public int health() { return health; }
    public double x() { return x; }
    public double y() { return y; }
    public Action action() { return action; }
}
