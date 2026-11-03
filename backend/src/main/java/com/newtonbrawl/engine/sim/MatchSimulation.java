package com.newtonbrawl.engine.sim;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;

import java.util.ArrayList;
import java.util.List;

import static com.newtonbrawl.engine.EngineConstants.DT;

/**
 * Deterministic 1v1 fighting simulation. Pure logic: no threads, clocks or I/O, so the same inputs
 * always produce the same states (a requirement for client-side prediction and for tests).
 *
 * <p>Format: best of 3 rounds ({@link MatchRules}), 99 s round clock, KO or time-out decides a round.
 *
 * <p>Order of operations per tick:
 * <ol>
 *   <li>hit-stop: if the world is frozen from a recent impact, count down and stop</li>
 *   <li>control: turn inputs into intent (walk, jump, crouch, start an attack)</li>
 *   <li>integrate: gravity, velocity, floor and walls</li>
 *   <li>separate: fighters' bodies can't overlap</li>
 *   <li>hits: active hitboxes vs. hurtboxes, resolved simultaneously so trades are possible</li>
 *   <li>advance: move frames, hitstun timers, KO checks</li>
 * </ol>
 */
public final class MatchSimulation {

    private final Arena arena;
    private final MatchRules rules;
    private final FighterState[] f = new FighterState[2];
    private final List<HitEvent> events = new ArrayList<>();
    private final int[] roundWins = new int[2];

    private long tick;
    private MatchPhase phase;
    private int phaseTicks;
    private int hitstop;
    private int round = 1;
    private int timer;
    private RoundResult lastRound;
    private MatchResult result;

    public MatchSimulation(Arena arena, Fighter p1, Fighter p2, MatchRules rules) {
        this.arena = arena;
        this.rules = rules;
        f[0] = new FighterState(0, p1, startX(0), +1);
        f[1] = new FighterState(1, p2, startX(1), -1);
        beginRound();
    }

    public MatchSimulation(Arena arena, Fighter p1, Fighter p2) {
        this(arena, p1, p2, MatchRules.STANDARD);
    }

    private double startX(int slot) {
        return arena.width() * (slot == 0 ? 0.35 : 0.65);
    }

    /** Advances the world by exactly one tick. */
    public void step(InputFrame in0, InputFrame in1) {
        tick++;
        events.clear();
        switch (phase) {
            case ROUND_START -> {
                physics(InputFrame.NONE, InputFrame.NONE);
                if (--phaseTicks <= 0) phase = MatchPhase.FIGHTING;
            }
            case FIGHTING -> {
                boolean frozen = hitstop > 0;
                physics(in0, in1);
                if (!frozen) timer--;
                checkRoundOver();
            }
            case ROUND_END -> {
                physics(InputFrame.NONE, InputFrame.NONE);
                if (--phaseTicks <= 0) {
                    if (result != null) phase = MatchPhase.FINISHED;
                    else {
                        round++;
                        beginRound();
                    }
                }
            }
            case FINISHED -> { /* frozen */ }
        }
    }

    private void beginRound() {
        f[0].resetForRound(startX(0), +1);
        f[1].resetForRound(startX(1), -1);
        hitstop = 0;
        timer = rules.roundTimeTicks();
        phaseTicks = rules.countdownTicks();
        phase = phaseTicks > 0 ? MatchPhase.ROUND_START : MatchPhase.FIGHTING;
    }

    private void physics(InputFrame in0, InputFrame in1) {
        if (hitstop > 0) {
            // World frozen on impact; remember presses so they come out right after.
            hitstop--;
            f[0].bufferPresses(in0.pressed());
            f[1].bufferPresses(in1.pressed());
            return;
        }
        control(f[0], in0, f[1]);
        control(f[1], in1, f[0]);
        integrate(f[0]);
        integrate(f[1]);
        separate(f[0], f[1]);
        resolveHits();
        advance(f[0]);
        advance(f[1]);
    }

    // ---------------------------------------------------------------- control

    private void control(FighterState s, InputFrame raw, FighterState opponent) {
        if (!s.action.isFree()) {
            s.bufferPresses(raw.pressed());
            return;
        }
        InputFrame in = new InputFrame(raw.held(), raw.pressed() | s.takeBufferedPresses());
        int dir = in.horizontal();

        if (s.grounded) {
            s.facing = opponent.x >= s.x ? 1 : -1; // always face the opponent on the ground
            if (tryAttack(s, in)) {
                s.vx *= 0.3; // plant feet
                return;
            }
            if (in.isHeld(InputBits.UP)) {
                s.vy = s.def.jumpVelocity();
                s.vx = dir * s.def.walkSpeed();
                s.grounded = false;
                s.action = Action.AIRBORNE;
            } else if (in.isHeld(InputBits.DOWN)) {
                s.vx = 0;
                s.action = Action.CROUCH;
            } else {
                s.vx = dir * s.def.walkSpeed();
                s.action = dir == 0 ? Action.IDLE : Action.WALK;
            }
        } else {
            if (tryAttack(s, in)) return; // air attacks keep momentum
            double max = s.def.walkSpeed();
            s.vx = clamp(s.vx + dir * s.def.airAcceleration() * DT, -max, max);
        }
    }

    private boolean tryAttack(FighterState s, InputFrame in) {
        String move = in.wasPressed(InputBits.HEAVY) ? "heavy" : in.wasPressed(InputBits.LIGHT) ? "light" : null;
        if (move == null || s.def.move(move) == null) return false;
        s.startMove(move);
        return true;
    }

    // -------------------------------------------------------------- integrate

    private void integrate(FighterState s) {
        s.vy -= arena.gravity() * DT;
        s.x += s.vx * DT;
        s.y += s.vy * DT;

        if (s.y <= 0) {
            s.y = 0;
            if (s.vy < 0) s.vy = 0;
            if (!s.grounded) {
                s.grounded = true;
                if (s.action == Action.AIRBORNE) s.action = Action.IDLE;
            }
        } else {
            s.grounded = false;
        }

        // Fighters that aren't actively walking slide to a stop.
        if (s.grounded && (s.action == Action.ATTACK || s.action == Action.HITSTUN || s.action == Action.KO)) {
            s.vx *= EngineConstants.GROUND_FRICTION;
        }
        clampToWalls(s);
    }

    private void clampToWalls(FighterState s) {
        double min = s.halfWidth(), max = arena.width() - s.halfWidth();
        if (s.x < min) { s.x = min; s.vx = Math.max(0, s.vx); }
        if (s.x > max) { s.x = max; s.vx = Math.min(0, s.vx); }
    }

    /** Push overlapping bodies apart equally; if one is pinned to a wall the other moves fully. */
    private void separate(FighterState a, FighterState b) {
        Aabb ha = a.hurtbox(), hb = b.hurtbox();
        boolean verticalOverlap = ha.y() < hb.y() + hb.h() && hb.y() < ha.y() + ha.h();
        if (!verticalOverlap) return;
        double dx = b.x - a.x;
        double minDist = a.halfWidth() + b.halfWidth();
        double overlap = minDist - Math.abs(dx);
        if (overlap <= 0) return;
        double sign = dx != 0 ? Math.signum(dx) : a.facing;
        a.x -= sign * overlap / 2;
        b.x += sign * overlap / 2;
        clampToWalls(a);
        clampToWalls(b);
        // Second pass: whoever wasn't stopped by a wall takes the remaining push.
        double remaining = minDist - Math.abs(b.x - a.x);
        if (remaining > 1e-9) {
            boolean aPinned = a.x <= a.halfWidth() + 1e-9 || a.x >= arena.width() - a.halfWidth() - 1e-9;
            if (aPinned) b.x += sign * remaining; else a.x -= sign * remaining;
            clampToWalls(a);
            clampToWalls(b);
        }
    }

    // ------------------------------------------------------------------- hits

    private void resolveHits() {
        Aabb hit0 = f[0].activeHitbox(), hit1 = f[1].activeHitbox();
        Aabb hurt0 = f[0].hurtbox(), hurt1 = f[1].hurtbox();
        boolean zeroHitsOne = hit0 != null && hit0.intersects(hurt1);
        boolean oneHitsZero = hit1 != null && hit1.intersects(hurt0);
        // Evaluate both before applying either so simultaneous hits trade.
        if (zeroHitsOne) applyHit(f[0], f[1], hit0.overlapCenter(hurt1));
        if (oneHitsZero) applyHit(f[1], f[0], hit1.overlapCenter(hurt0));
    }

    /**
     * Knockback is momentum transfer: the move delivers an impulse J, and the defender's new
     * velocity is J / m. Heavier fighters (Bruisers) are launched less by the same hit.
     */
    private void applyHit(FighterState atk, FighterState def, double[] point) {
        MoveDefinition m = atk.move;
        String moveId = atk.moveId;
        atk.moveConnected = true;

        def.health = Math.max(0, def.health - m.damage());
        atk.addEnergy(m.damage() * EngineConstants.ENERGY_PER_DAMAGE_DEALT);
        def.addEnergy(m.damage() * EngineConstants.ENERGY_PER_DAMAGE_TAKEN);
        def.clearMove();
        def.action = Action.HITSTUN;
        def.stunTicks = m.hitstun();
        def.vx = atk.facing * m.impulse().x() / def.def.mass();
        def.vy = m.impulse().y() / def.def.mass();
        if (def.vy > 0) def.grounded = false;

        hitstop = Math.max(hitstop, m.hitstop());
        events.add(new HitEvent(atk.slot, def.slot, moveId, m.damage(), round(point[0]), round(point[1])));
    }

    // ---------------------------------------------------------------- advance

    private void advance(FighterState s) {
        switch (s.action) {
            case ATTACK -> {
                s.moveFrame++;
                if (s.moveFrame >= s.move.totalFrames()) {
                    s.clearMove();
                    s.action = s.grounded ? Action.IDLE : Action.AIRBORNE;
                }
            }
            case HITSTUN -> {
                if (--s.stunTicks <= 0) s.action = s.grounded ? Action.IDLE : Action.AIRBORNE;
            }
            default -> { }
        }
    }

    private void checkRoundOver() {
        boolean ko0 = f[0].health <= 0, ko1 = f[1].health <= 0;
        if (ko0 || ko1) {
            if (ko0) { f[0].action = Action.KO; f[0].clearMove(); }
            if (ko1) { f[1].action = Action.KO; f[1].clearMove(); }
            endRound(ko0 && ko1 ? -1 : ko0 ? 1 : 0, ko0 && ko1 ? RoundResult.Reason.DOUBLE_KO : RoundResult.Reason.KO);
        } else if (timer <= 0) {
            // Time out: the higher remaining health fraction takes the round.
            double h0 = (double) f[0].health / f[0].def.maxHealth();
            double h1 = (double) f[1].health / f[1].def.maxHealth();
            endRound(h0 > h1 ? 0 : h1 > h0 ? 1 : -1, RoundResult.Reason.TIME);
        }
    }

    private void endRound(int winner, RoundResult.Reason reason) {
        if (winner >= 0) roundWins[winner]++;
        lastRound = new RoundResult(round, winner, reason);
        phase = MatchPhase.ROUND_END;
        phaseTicks = rules.roundEndTicks();

        boolean decided = roundWins[0] >= rules.roundsToWin() || roundWins[1] >= rules.roundsToWin();
        if (decided || round >= rules.maxRounds()) {
            int matchWinner = roundWins[0] > roundWins[1] ? 0 : roundWins[1] > roundWins[0] ? 1 : -1;
            result = new MatchResult(matchWinner, MatchResult.Reason.DECISION, tick, roundWinsList());
        }
    }

    // ---------------------------------------------------------------- queries

    public MatchSnapshot snapshot() {
        int timed = (phase == MatchPhase.ROUND_START || phase == MatchPhase.ROUND_END) ? phaseTicks : 0;
        return new MatchSnapshot(tick, phase, timed, hitstop, round, roundWinsList(), timer, lastRound,
            List.of(f[0].view(), f[1].view()), List.copyOf(events));
    }

    public List<Integer> roundWinsList() {
        return List.of(roundWins[0], roundWins[1]);
    }

    public MatchPhase phase() { return phase; }
    public long tick() { return tick; }
    public int round() { return round; }
    public int timer() { return timer; }
    public Arena arena() { return arena; }
    public MatchRules rules() { return rules; }
    /** Non-null once the match is decided (the final ROUND_END may still be playing). */
    public MatchResult result() { return result; }
    public RoundResult lastRound() { return lastRound; }
    public FighterState fighter(int slot) { return f[slot]; }

    /** Test/tooling hook: teleport a fighter (e.g. to set up a scenario). */
    public void place(int slot, double x, double y) {
        f[slot].x = x;
        f[slot].y = y;
        f[slot].grounded = y <= 0;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static double round(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
