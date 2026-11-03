package com.newtonbrawl.engine.sim;

import com.newtonbrawl.engine.EngineConstants;
import com.newtonbrawl.engine.fighter.Fighter;
import com.newtonbrawl.engine.fighter.FighterDefinition.MoveDefinition;
import com.newtonbrawl.engine.fighter.MoveKind;
import com.newtonbrawl.engine.input.InputBits;
import com.newtonbrawl.engine.input.InputFrame;

import java.util.ArrayList;
import java.util.List;

import static com.newtonbrawl.engine.EngineConstants.DT;

/**
 * Deterministic 1v1 fighting simulation. Pure logic: no threads, clocks or I/O, so the same inputs
 * always produce the same states (a requirement for client-side prediction and for tests).
 *
 * <p>The TypeScript port in {@code frontend/src/game/sim/MatchSimulation.ts} mirrors this file
 * method-for-method; {@code ParityFixtureTest} + {@code parity.test.ts} keep them identical.
 *
 * <p>Format: best of 3 rounds ({@link MatchRules}), 99 s round clock, KO or time-out decides a round.
 *
 * <p>Order of operations per tick:
 * <ol>
 *   <li>freezes: ULTIMATE cinematic, then impact hit-stop (inputs are buffered meanwhile)</li>
 *   <li>time dilation: fighters inside an opponent's bubble only act on some ticks</li>
 *   <li>control → integrate (gravity, flipped gravity, floor/ceiling/walls) → separate bodies</li>
 *   <li>zone forces (magnetic pull), arena objects (bounce, thrown-object hits)</li>
 *   <li>melee hits (simultaneous, so trades happen), melee vs objects</li>
 *   <li>projectiles (accelerate, decay, chain through metal, reflect, hit)</li>
 *   <li>zones (traps, blasts, beams, fields)</li>
 *   <li>advance move frames (special triggers fire here) and status timers</li>
 * </ol>
 */
public final class MatchSimulation implements MatchWorld {

    private final Arena arena;
    private final MatchRules rules;
    private final FighterState[] f = new FighterState[2];
    private final List<GameEvent> events = new ArrayList<>();
    private final int[] roundWins = new int[2];
    private final List<Projectile> projectiles = new ArrayList<>();
    private final List<Zone> zones = new ArrayList<>();
    private final List<ArenaObject> objects = new ArrayList<>();

    private int nextId = 1;
    private long tick;
    private MatchPhase phase;
    private int phaseTicks;
    private int hitstop;
    private int cinematic;
    private int round = 1;
    private int timer;
    private RoundResult lastRound;
    private MatchResult result;
    /** xorshift32 state for {@link #random(int)}; mirrored exactly by the TypeScript port. */
    private int rng = 0x2F6B1D3A;
    /** Zones spawned while zones are being updated (added after the loop). */
    private final List<Zone> pendingZones = new ArrayList<>();

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
                boolean frozen = hitstop > 0 || cinematic > 0;
                physics(in0, in1);
                if (!frozen) timer--;
                checkRoundOver();
            }
            case ROUND_END -> {
                // The deciding KO plays in slow motion: physics runs on every third tick at first.
                boolean slowmo = result != null && phaseTicks > rules.roundEndTicks() - EngineConstants.SLOWMO_TICKS;
                if (!slowmo || phaseTicks % 3 == 0) physics(InputFrame.NONE, InputFrame.NONE);
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
        projectiles.clear();
        zones.clear();
        objects.clear();
        for (Arena.ObjectSpawn spawn : arena.objects()) {
            objects.add(new ArenaObject(nextId++, spawn));
        }
        hitstop = 0;
        cinematic = 0;
        timer = rules.roundTimeTicks();
        phaseTicks = rules.countdownTicks();
        phase = phaseTicks > 0 ? MatchPhase.ROUND_START : MatchPhase.FIGHTING;
    }

    private void physics(InputFrame in0, InputFrame in1) {
        FighterState a = f[0], b = f[1];
        if (cinematic > 0) {
            cinematic--;
            a.bufferPresses(in0.pressed());
            b.bufferPresses(in1.pressed());
            return;
        }
        if (hitstop > 0) {
            // World frozen on impact; remember presses so they come out right after.
            hitstop--;
            a.bufferPresses(in0.pressed());
            b.bufferPresses(in1.pressed());
            return;
        }
        boolean actA = takeTimeSlice(a), actB = takeTimeSlice(b);
        if (actA) control(a, in0, b); else a.bufferPresses(in0.pressed());
        if (actB) control(b, in1, a); else b.bufferPresses(in1.pressed());
        if (actA) integrate(a);
        if (actB) integrate(b);
        separate(a, b);
        applyZoneForces();
        updateObjects();
        resolveMelee();
        updateProjectiles();
        updateZones();
        if (actA) advance(a, b);
        if (actB) advance(b, a);
        tickStatuses(a);
        tickStatuses(b);
        projectiles.removeIf(p -> p.dead);
        zones.removeIf(z -> z.dead);
    }

    // ------------------------------------------------------------ time dilation

    /** Lowest time scale of any opponent-owned bubble containing the point. */
    private double timeScaleAt(double px, double py, int slot) {
        double scale = 1.0;
        for (Zone z : zones) {
            if (!z.dead && Zone.BUBBLE.equals(z.kind) && z.owner != slot && z.contains(px, py)) {
                scale = Math.min(scale, z.timeScale);
            }
        }
        return scale;
    }

    /** Inside a bubble at scale 0.4 a fighter acts on 2 ticks out of 5: Δt′ = γΔt, played as a fighting game. */
    private boolean takeTimeSlice(FighterState s) {
        double scale = timeScaleAt(s.x, s.y + s.def.body().height() / 2, s.slot);
        if (s.chillTicks > 0) scale = Math.min(scale, EngineConstants.CHILL_SCALE);
        s.timeAcc += scale;
        if (s.timeAcc >= 1.0) {
            s.timeAcc -= 1.0;
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- control

    private void control(FighterState s, InputFrame raw, FighterState opponent) {
        if (!s.action.isFree() || s.buoyTicks > 0) {
            s.bufferPresses(raw.pressed());
            return;
        }
        InputFrame in = new InputFrame(raw.held(), raw.pressed() | s.takeBufferedPresses());
        int dir = in.horizontal();
        if (s.scrambleTicks > 0) dir = -dir; // Uncertainty Principle: you can't be sure where you're going

        if (s.grounded) {
            if (s.blindTicks == 0) s.facing = opponent.x >= s.x ? 1 : -1; // face the opponent on the ground (unless dazzled)
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

    /**
     * Button mapping: ULTIMATE (or HEAVY+SPECIAL together) with a full meter → ultimate;
     * SPECIAL → special1, DOWN+SPECIAL → special2 (each with its own cooldown); then heavy, light.
     */
    private boolean tryAttack(FighterState s, InputFrame in) {
        boolean ultPress = in.wasPressed(InputBits.ULTIMATE)
            || (in.wasPressed(InputBits.SPECIAL) && in.isHeld(InputBits.HEAVY))
            || (in.wasPressed(InputBits.HEAVY) && in.isHeld(InputBits.SPECIAL));
        boolean canSee = s.blindTicks == 0; // dazzled fighters can't aim specials
        if (canSee && ultPress && s.energy >= EngineConstants.ENERGY_MAX && s.def.move("ultimate") != null) {
            s.startMove("ultimate");
            s.energy = 0;
            cinematic = EngineConstants.CINEMATIC_TICKS;
            events.add(new GameEvent(GameEvent.ULTIMATE, s.slot, -1, "ultimate", 0, r(s.x), r(s.y + s.def.body().height() / 2)));
            return true;
        }
        if (canSee && in.wasPressed(InputBits.SPECIAL)) {
            int idx = in.isHeld(InputBits.DOWN) ? 1 : 0;
            String id = idx == 0 ? "special1" : "special2";
            MoveDefinition m = s.def.move(id);
            if (m != null && s.cooldowns[idx] == 0) {
                s.startMove(id);
                s.cooldowns[idx] = m.cooldown();
                return true;
            }
        }
        String move = in.wasPressed(InputBits.HEAVY) ? "heavy" : in.wasPressed(InputBits.LIGHT) ? "light" : null;
        if (move == null || s.def.move(move) == null) return false;
        s.startMove(move);
        return true;
    }

    // -------------------------------------------------------------- integrate

    private void integrate(FighterState s) {
        double gScale = s.flipTicks > 0 ? EngineConstants.FLIP_GRAVITY : s.buoyTicks > 0 ? EngineConstants.BUOY_GRAVITY : 1.0;
        boolean flipped = gScale < 0;
        double g = arena.gravity() * gScale;
        s.vy -= g * DT;
        s.x += s.vx * DT;
        s.y += s.vy * DT;
        Arena.Well well = arena.well();
        if (well != null && Math.abs(well.x() - s.x) > 30) {
            s.x += Math.signum(well.x() - s.x) * well.drift() * DT; // slow tidal drift toward the black hole
        }

        if (flipped) {
            // Gravity points up: the fighter drifts helplessly toward the ceiling.
            s.grounded = false;
            if (s.action == Action.IDLE || s.action == Action.WALK || s.action == Action.CROUCH) s.action = Action.AIRBORNE;
            if (s.y < 0) {
                s.y = 0;
                if (s.vy < 0) s.vy = 0;
            }
        } else if (s.y <= 0) {
            s.y = 0;
            if (s.vy < 0) s.vy = 0;
            if (!s.grounded) {
                s.grounded = true;
                if (s.action == Action.AIRBORNE) s.action = Action.IDLE;
            }
        } else {
            s.grounded = false;
        }
        double top = arena.height() - s.def.body().height();
        if (s.y > top) {
            s.y = top;
            if (s.vy > 0) s.vy = 0;
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
        double remaining = minDist - Math.abs(b.x - a.x);
        if (remaining > 1e-9) {
            boolean aPinned = a.x <= a.halfWidth() + 1e-9 || a.x >= arena.width() - a.halfWidth() - 1e-9;
            if (aPinned) b.x += sign * remaining; else a.x -= sign * remaining;
            clampToWalls(a);
            clampToWalls(b);
        }
    }

    // ------------------------------------------------------------ zone forces

    /** Magnetic pull: the opponent and metal objects slide toward the zone's owner. */
    private void applyZoneForces() {
        for (Zone z : zones) {
            if (z.dead) continue;
            if (Zone.STORM.equals(z.kind) || Zone.VORTEX.equals(z.kind)) {
                FighterState t = f[1 - z.owner];
                double dx = z.x - t.x;
                boolean inside = z.contains(t.x, t.y + t.def.body().height() / 2) && t.invulnTicks == 0;
                if (inside && Math.abs(dx) > 20) {
                    t.x += Math.signum(dx) * z.strength * DT;
                    clampToWalls(t);
                }
                if (inside && Zone.VORTEX.equals(z.kind) && t.y < z.lift) {
                    t.vy = Math.max(t.vy, 520); // the low pressure in the eye lifts them
                    t.grounded = false;
                }
                continue;
            }
            if (Zone.SINGULARITY.equals(z.kind)) {
                // Pull grows toward the centre like a softened inverse-square law.
                FighterState t = f[1 - z.owner];
                double cy = t.y + t.def.body().height() / 2;
                double dx = z.x - t.x, dy = z.y - cy, rr = z.w / 2;
                if (z.contains(t.x, cy) && Math.abs(dx) > 10 && t.invulnTicks == 0) {
                    double v = z.strength * rr * rr / (dx * dx + dy * dy + rr * rr * 0.25);
                    t.x += Math.signum(dx) * Math.min(Math.abs(dx), v * DT);
                    clampToWalls(t);
                }
                continue;
            }
            if (!Zone.PULL.equals(z.kind)) continue;
            FighterState src = f[z.owner], t = f[1 - z.owner];
            double dx = src.x - t.x;
            if (Math.abs(dx) <= z.w / 2 && Math.abs(dx) > 110 && t.invulnTicks == 0) {
                t.x += Math.signum(dx) * z.strength * DT;
                clampToWalls(t);
            }
            for (ArenaObject o : objects) {
                double dxo = src.x - o.x;
                if (o.metal && Math.abs(dxo) <= z.w / 2 && Math.abs(dxo) > 60) {
                    o.vx = Math.signum(dxo) * z.strength * 1.6;
                    o.owner = z.owner;
                }
            }
        }
    }

    // ---------------------------------------------------------------- objects

    private void updateObjects() {
        boolean zeroG = arena.objectGravity() == 0;
        Arena.Well well = arena.well();
        for (ArenaObject o : objects) {
            if (well != null) {
                // a = GM / (r² + soft²) toward the black hole; inside the core the prop is swallowed.
                double dx = well.x() - o.x, dy = well.y() - o.centerY(), r2 = dx * dx + dy * dy, rr = Math.sqrt(r2);
                if (rr < well.core()) {
                    events.add(new GameEvent(GameEvent.SWALLOW, -1, -1, o.kind, 0, r(o.x), r(o.centerY())));
                    o.respawn();
                    continue;
                }
                double a = well.gm() / (r2 + well.soft() * well.soft()) * DT;
                o.vx += dx / rr * a;
                o.vy += dy / rr * a;
            }
            o.vy -= arena.gravity() * arena.objectGravity() * DT;
            o.x += o.vx * DT;
            o.y += o.vy * DT;
            if (o.y <= 0) {
                o.y = 0;
                if (o.vy < -150 || (zeroG && o.vy < 0)) o.vy = -o.vy * arena.bounce(); else o.vy = 0;
                if (!zeroG) {
                    o.vx *= 0.9;
                    if (Math.abs(o.vx) < 5) o.vx = 0;
                }
            }
            if (o.y + o.h > arena.height()) { o.y = arena.height() - o.h; if (o.vy > 0) o.vy = -o.vy * arena.bounce(); }
            double half = o.w / 2;
            if (o.x < half) { o.x = half; o.vx = -o.vx * arena.wallBounce(); }
            if (o.x > arena.width() - half) { o.x = arena.width() - half; o.vx = -o.vx * arena.wallBounce(); }

            if (o.owner >= 0) {
                double speed = Math.abs(o.vx) + Math.abs(o.vy);
                FighterState t = f[1 - o.owner];
                Aabb ob = o.box(), hurt = t.hurtbox();
                if (speed > EngineConstants.OBJECT_DANGER_SPEED && t.invulnTicks == 0 && ob.intersects(hurt)) {
                    double[] pt = ob.overlapCenter(hurt);
                    hitFighter(f[o.owner], t, 60, Math.signum(o.vx) * 26000, 14000, 16, 5, "object", pt);
                    o.vx = -o.vx * 0.3;
                    o.owner = -1;
                } else if (speed < 200) {
                    o.owner = -1;
                }
            }
        }
    }

    // ------------------------------------------------------------------- hits

    private void resolveMelee() {
        Aabb hit0 = f[0].activeHitbox(), hit1 = f[1].activeHitbox();
        Aabb hurt0 = f[0].hurtbox(), hurt1 = f[1].hurtbox();
        boolean zeroHitsOne = hit0 != null && f[1].invulnTicks == 0 && hit0.intersects(hurt1);
        boolean oneHitsZero = hit1 != null && f[0].invulnTicks == 0 && hit1.intersects(hurt0);
        // Evaluate both before applying either so simultaneous hits trade. Capture the moves first:
        // applying the first hit clears the second attacker's move.
        MoveDefinition m0 = f[0].move, m1 = f[1].move;
        String id0 = f[0].moveId, id1 = f[1].moveId;
        if (zeroHitsOne) meleeHit(f[0], f[1], m0, id0, hit0.overlapCenter(hurt1));
        if (oneHitsZero) meleeHit(f[1], f[0], m1, id1, hit1.overlapCenter(hurt0));

        for (FighterState s : f) {
            Aabb hb = s.activeHitbox();
            if (hb == null) continue;
            for (int i = 0; i < objects.size(); i++) {
                ArenaObject o = objects.get(i);
                if ((s.objHitMask & (1 << i)) != 0 || !hb.intersects(o.interactBox())) continue;
                s.objHitMask |= 1 << i;
                o.vx = s.facing * s.move.impulse().x() / EngineConstants.OBJECT_MASS;
                o.vy = Math.max(0, s.move.impulse().y() / EngineConstants.OBJECT_MASS) + 380;
                o.owner = s.slot;
                double[] pt = hb.overlapCenter(o.interactBox());
                events.add(new GameEvent(GameEvent.CLANK, s.slot, -1, s.moveId, 0, r(pt[0]), r(pt[1])));
            }
        }
    }

    private void meleeHit(FighterState atk, FighterState def, MoveDefinition m, String moveId, double[] point) {
        atk.moveConnected = true;
        hitFighter(atk, def, m.damage(), atk.facing * m.impulse().x(), m.impulse().y(), m.hitstun(), m.hitstop(),
            moveId, point);
    }

    /**
     * Applies a hit from {@code src} to {@code target}. Knockback is momentum transfer: the hit
     * delivers impulse J and the target's velocity becomes J / m.
     *
     * <p>Newton's Third Law: if the target is reflecting, the attacker receives the hit instead, with
     * the impulse reversed ("every action has an equal and opposite reaction").
     */
    private boolean hitFighter(FighterState src, FighterState target, int damage, double ix, double iy,
                               int hitstun, int stop, String move, double[] point) {
        if (src != target && collapse(target, src)) return false;
        if (target.reflectTicks > 0 && src != target) {
            applyDamage(target, src, damage, -ix, iy, hitstun);
            hitstop = Math.max(hitstop, stop);
            events.add(new GameEvent(GameEvent.REFLECT, target.slot, src.slot, move, damage, r(point[0]), r(point[1])));
            return false;
        }
        applyDamage(src, target, damage, ix, iy, hitstun);
        hitstop = Math.max(hitstop, stop);
        events.add(new GameEvent(GameEvent.HIT, src.slot, target.slot, move, damage, r(point[0]), r(point[1])));
        return true;
    }

    /**
     * Superposition: the first hit on a fighter with a live GHOST "measures" which copy was real.
     * Heads, he was the ghost all along: he appears there and the hit passes through. Tails, the
     * ghost vanishes and the hit lands. Returns true if the hit is cancelled.
     */
    private boolean collapse(FighterState target, FighterState src) {
        for (Zone z : zones) {
            if (z.dead || z.owner != target.slot || !Zone.GHOST.equals(z.kind)) continue;
            z.dead = true;
            boolean dodge = random(2) == 0;
            events.add(new GameEvent(GameEvent.COLLAPSE, target.slot, src.slot, z.move, dodge ? 1 : 0, r(z.x), r(z.y)));
            if (dodge) {
                target.x = z.x;
                clampToWalls(target);
                target.invulnTicks = Math.max(target.invulnTicks, z.arm);
            }
            return dodge;
        }
        return false;
    }

    private void applyDamage(FighterState src, FighterState target, int damage, double ix, double iy, int hitstun) {
        target.health = Math.max(0, target.health - damage);
        src.addEnergy(damage * EngineConstants.ENERGY_PER_DAMAGE_DEALT);
        target.addEnergy(damage * EngineConstants.ENERGY_PER_DAMAGE_TAKEN);
        target.clearMove();
        target.action = Action.HITSTUN;
        target.stunTicks = hitstun;
        target.vx = ix / target.def.mass();
        target.vy = iy / target.def.mass();
        if (target.vy > 0) target.grounded = false;
    }

    // ------------------------------------------------------------ projectiles

    private void updateProjectiles() {
        for (Projectile p : projectiles) {
            if (p.dead) continue;
            double scale = timeScaleAt(p.x, p.y, p.owner);
            p.age++;
            p.life--;
            switch (p.motion) {
                case LINEAR -> {
                    p.vx += p.ax * DT * scale;
                    p.vy += p.ay * DT * scale;
                    p.x += p.vx * DT * scale;
                    p.y += p.vy * DT * scale;
                }
                case PENDULUM -> {
                    // θ'' = −(g/L)·θ  →  period T = 2π·√(L/g)
                    p.omega -= p.gOverL * p.theta * DT * scale;
                    p.theta += p.omega * DT * scale;
                    p.x = p.pivotX + p.length * p.theta;
                    p.y = p.pivotY - p.length * (1 - p.theta * p.theta * 0.5);
                }
                case ORBIT -> {
                    // central force a = −ω²·r keeps the moon circling its caster
                    FighterState a = f[p.anchor];
                    p.ovx -= p.k * p.ox * DT * scale;
                    p.ovy -= p.k * p.oy * DT * scale;
                    p.ox += p.ovx * DT * scale;
                    p.oy += p.ovy * DT * scale;
                    p.x = a.x + p.ox;
                    p.y = a.y + a.def.body().height() * 0.55 + p.oy;
                }
            }
            if (p.shrink > 0) {
                p.w = Math.max(p.minSize, p.w - p.shrink * scale);
                p.h = p.w;
            }
            if (p.motion == Projectile.Motion.LINEAR && bendAndSwallow(p, scale)) {
                p.dead = true;
                continue;
            }
            if (p.electric && p.chains < p.maxChains) chainThroughMetal(p);

            FighterState target = f[1 - p.owner];
            Aabb box = p.box(), hurt = target.hurtbox();
            if (target.invulnTicks == 0 && !p.evaded && box.intersects(hurt)) {
                double[] pt = box.overlapCenter(hurt);
                if (target.def.evade() > 0 && random(100) < target.def.evade()) {
                    // Heisenberg: his position was never well defined, and the shot passes through.
                    p.evaded = true;
                    events.add(new GameEvent(GameEvent.PHASE, target.slot, p.owner, p.move, 0, r(pt[0]), r(pt[1])));
                    continue;
                }
                if (p.electric && target.cageTicks > 0) {
                    // Faraday cage: charge spreads over the conducting shell, none reaches inside.
                    events.add(new GameEvent(GameEvent.BLOCK, target.slot, p.owner, p.move, 0, r(pt[0]), r(pt[1])));
                    p.dead = true;
                    continue;
                }
                if (target.reflectTicks > 0 && !p.reflected && p.motion != Projectile.Motion.LINEAR) {
                    // Swinging / orbiting attacks can't be sent back along a straight line: they're simply stopped.
                    events.add(new GameEvent(GameEvent.REFLECT, target.slot, 1 - target.slot, p.move, 0, r(pt[0]), r(pt[1])));
                    p.dead = true;
                    continue;
                }
                if (target.reflectTicks > 0 && !p.reflected) {
                    // Third Law: the projectile comes straight back at whoever threw it.
                    p.owner = target.slot;
                    p.vx = -p.vx;
                    p.ax = -p.ax;
                    p.dir = -p.dir;
                    p.reflected = true;
                    events.add(new GameEvent(GameEvent.REFLECT, target.slot, 1 - target.slot, p.move, 0, r(pt[0]), r(pt[1])));
                } else {
                    int dmg = p.currentDamage();
                    double ix = p.dir * p.impulseX, iy = p.impulseY;
                    if (p.effect == Projectile.Effect.MEASURE) {
                        // Δx·Δp ≥ ħ/2: position pinned down, so the momentum kick is anyone's guess.
                        int sign = random(2) == 0 ? 1 : -1;
                        ix = sign * p.impulseX * (0.5 + 0.5 * random(3));
                        iy = p.impulseY * (0.5 + 0.5 * random(3));
                    }
                    if (p.effect == Projectile.Effect.DOPPLER) {
                        // f' = f·(c + v_o)/(c − v_s): approaching source or observer → higher pitch, more damage.
                        double vo = -p.dir * target.vx;
                        double ratio = clamp((p.waveSpeed + vo) / (p.waveSpeed - p.vs), 0.5, 2.5);
                        dmg = (int) Math.round(dmg * ratio);
                    }
                    int stun = p.hitstun;
                    boolean freeze = p.effect == Projectile.Effect.CHILL && target.chillTicks > 0;
                    if (freeze) stun = p.freezeStun; // cooled again before warming up: frozen solid
                    boolean landed = hitFighter(f[p.owner], target, dmg, ix, iy, stun, p.hitstop, p.move, pt);
                    if (landed && p.effect == Projectile.Effect.CHILL) {
                        target.chillTicks = freeze ? 0 : p.effectTicks;
                        if (freeze) events.add(new GameEvent(GameEvent.FREEZE, p.owner, target.slot, p.move, 0, r(pt[0]), r(pt[1])));
                    }
                    if (landed && p.effect == Projectile.Effect.GRAVITY_FLIP) target.flipTicks = p.effectTicks;
                    if (landed && p.effect == Projectile.Effect.BUOY) target.buoyTicks = p.effectTicks;
                    p.dead = true;
                    continue;
                }
            }
            if (p.wraps > 0 && (p.x < 0 || p.x > arena.width())) {
                // radio waves don't stop at walls: it comes back in from the other side
                p.x = p.x < 0 ? p.x + arena.width() : p.x - arena.width();
                p.wraps--;
            }
            boolean hitFloor = p.y - p.h / 2 <= 0 && p.vy < 0;
            boolean outside = p.x < -100 || p.x > arena.width() + 100 || p.y > arena.height() + 200;
            if (p.life <= 0 || hitFloor || outside) p.dead = true;
        }
    }

    /**
     * Gravitational lensing: straight-line projectiles curve toward the arena's black hole and
     * toward the opponent's singularities, and are swallowed inside their cores. Returns true if swallowed.
     */
    private boolean bendAndSwallow(Projectile p, double scale) {
        Arena.Well well = arena.well();
        if (well != null) {
            double dx = well.x() - p.x, dy = well.y() - p.y, r2 = dx * dx + dy * dy, rr = Math.sqrt(r2);
            if (rr < well.core()) {
                events.add(new GameEvent(GameEvent.SWALLOW, p.owner, -1, p.move, 0, r(p.x), r(p.y)));
                return true;
            }
            double a = well.gm() / (r2 + well.soft() * well.soft()) * DT * scale;
            p.vx += dx / rr * a;
            p.vy += dy / rr * a;
        }
        for (Zone z : zones) {
            if (z.dead || z.owner == p.owner || !Zone.SINGULARITY.equals(z.kind) || !z.contains(p.x, p.y)) continue;
            double dx = z.x - p.x, dy = z.y - p.y, r2 = dx * dx + dy * dy, rr = Math.sqrt(r2), half = z.w / 2;
            if (rr < z.core) {
                events.add(new GameEvent(GameEvent.SWALLOW, z.owner, p.owner, p.move, 0, r(p.x), r(p.y)));
                return true;
            }
            double a = z.strength * 20 * half * half / (r2 + half * half * 0.25) * DT * scale;
            p.vx += dx / rr * a;
            p.vy += dy / rr * a;
        }
        return false;
    }

    /** Tesla's lightning jumps to the opponent whenever it passes a metal object. */
    private void chainThroughMetal(Projectile p) {
        for (ArenaObject o : objects) {
            if (!o.metal || o.id == p.lastChainObject) continue;
            if (Math.abs(o.x - p.x) < 50 && Math.abs(o.centerY() - p.y) < 110) {
                FighterState t = f[1 - p.owner];
                double dx = t.x - o.x;
                double dy = (t.y + t.def.body().height() / 2) - o.centerY();
                double dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) dist = 1;
                double speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                p.x = o.x;
                p.y = o.centerY();
                p.vx = dx / dist * speed;
                p.vy = dy / dist * speed;
                p.ax = 0;
                p.ay = 0;
                p.dir = dx >= 0 ? 1 : -1;
                p.chains++;
                p.damage = (int) Math.round(p.damage * 1.25);
                p.life = Math.max(p.life, 50);
                p.lastChainObject = o.id;
                events.add(new GameEvent(GameEvent.ARC, p.owner, -1, p.move, 0, r(o.x), r(o.centerY())));
                return;
            }
        }
    }

    // ------------------------------------------------------------------ zones

    private void updateZones() {
        for (Zone z : zones) {
            if (z.dead) continue;
            z.age++;
            z.life--;
            FighterState src = f[z.owner], t = f[1 - z.owner];
            Aabb hurt = t.hurtbox();
            switch (z.kind) {
                case Zone.TRAP -> {
                    if (z.arm > 0) {
                        z.arm--;
                    } else if (t.invulnTicks == 0 && t.grounded && z.box().intersects(hurt)) {
                        hitFighter(src, t, z.damage, 0, z.impulseY, z.hitstun, z.hitstop, z.move, z.box().overlapCenter(hurt));
                        z.dead = true;
                    }
                }
                case Zone.BLAST, Zone.BEAM, Zone.LEVER, Zone.FOCUS, Zone.WAVE, Zone.BURST, Zone.BOOM -> {
                    boolean live = z.age > z.delay && z.age <= z.delay + z.active;
                    if (live && (z.hitMask & (1 << t.slot)) == 0 && t.invulnTicks == 0 && z.box().intersects(hurt)) {
                        z.hitMask |= 1 << t.slot;
                        int dir = Zone.BEAM.equals(z.kind) || Zone.BOOM.equals(z.kind) ? z.dir : (t.x >= z.x ? 1 : -1);
                        boolean landed = hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                            z.box().overlapCenter(hurt));
                        if (landed && z.blind > 0) t.blindTicks = z.blind;
                    }
                    if (z.age > z.delay + z.active) z.dead = true;
                }
                case Zone.FIELD -> {
                    if (z.age % z.interval == 0 && t.invulnTicks == 0 && electricBlocked(z, t)) {
                        events.add(new GameEvent(GameEvent.BLOCK, t.slot, z.owner, z.move, 0, r(t.x), r(t.y + t.def.body().height() * 0.6)));
                    } else if (z.age % z.interval == 0 && t.invulnTicks == 0) {
                        int dir = t.x >= src.x ? 1 : -1;
                        hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                            new double[] {t.x, t.y + t.def.body().height() * 0.6});
                    }
                }
                case Zone.INDUCTION -> {
                    // Moving through the coil's field induces current: faster movement, more damage.
                    if (t.invulnTicks == 0 && z.box().intersects(hurt)) {
                        z.acc += (Math.abs(t.vx) + Math.abs(t.vy)) * DT * z.strength;
                        if (z.acc >= z.damage) {
                            z.acc -= z.damage;
                            if (electricBlocked(z, t)) {
                                events.add(new GameEvent(GameEvent.BLOCK, t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60)));
                            } else {
                                hitFighter(src, t, z.damage, (t.vx >= 0 ? 1 : -1) * z.impulseX, z.impulseY, z.hitstun, z.hitstop,
                                    z.move, z.box().overlapCenter(hurt));
                            }
                        }
                    }
                }
                case Zone.STORM, Zone.VORTEX -> {
                    if (z.age % z.interval == 0 && t.invulnTicks == 0 && z.contains(t.x, t.y + t.def.body().height() / 2)) {
                        if (electricBlocked(z, t)) {
                            events.add(new GameEvent(GameEvent.BLOCK, t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60)));
                        } else {
                            int dir = t.x >= z.x ? 1 : -1;
                            hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                                new double[] {t.x, t.y + t.def.body().height() * 0.5});
                        }
                    }
                }
                case Zone.SPRING -> {
                    if (z.arm > 0) {
                        z.arm--;
                    } else if (t.invulnTicks == 0 && t.grounded && z.box().intersects(hurt)) {
                        // F = −kx: the farther Hooke has stretched the spring, the harder it snaps.
                        double stretch = Math.min(z.maxStretch, Math.abs(src.x - z.x));
                        double force = z.springK * stretch;
                        int dir = src.x >= z.x ? 1 : -1; // snaps back toward Hooke
                        int dmg = z.damage + (int) Math.round(stretch * 0.15);
                        hitFighter(src, t, dmg, dir * force * 0.4, force, z.hitstun, z.hitstop, z.move, z.box().overlapCenter(hurt));
                        z.dead = true;
                    }
                }
                case Zone.CATBOX -> {
                    if (z.age >= z.delay) openBox(z, t);
                }
                case Zone.CLOUD, Zone.CURRENT -> {
                    if (z.age % z.interval == 0 && t.invulnTicks == 0 && z.box().intersects(hurt)) {
                        if (electricBlocked(z, t)) {
                            events.add(new GameEvent(GameEvent.BLOCK, t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60)));
                        } else {
                            int dir = t.x >= z.x ? 1 : -1;
                            hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                                new double[] {t.x, t.y + t.def.body().height() * 0.6});
                        }
                    }
                }
                case Zone.VINE -> {
                    if (z.arm > 0) {
                        z.arm--; // still growing
                    } else {
                        boolean inside = t.invulnTicks == 0 && z.box().intersects(hurt);
                        boolean synced = z.delay > 0;
                        boolean moving = Math.abs(t.vx) + Math.abs(t.vy) > 60; // the stimulus the plant reacts to
                        if (synced ? z.age >= z.delay : inside && moving) {
                            if (inside) {
                                int dir = z.x >= t.x ? 1 : -1; // the vine drags them toward its root
                                hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                                    z.box().overlapCenter(hurt));
                            }
                            z.dead = true;
                        }
                    }
                }
                case Zone.UNCERTAIN -> {
                    // Whether it strikes this time is genuinely random: 50% every interval.
                    if (z.age % z.interval == 0 && t.invulnTicks == 0 && random(2) == 0) {
                        int dir = random(2) == 0 ? 1 : -1;
                        hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                            new double[] {t.x, t.y + t.def.body().height() * 0.6});
                    }
                }
                case Zone.SINGULARITY -> {
                    double cy = t.y + t.def.body().height() / 2, dx = t.x - z.x, dy = cy - z.y;
                    if (z.age % z.interval == 0 && t.invulnTicks == 0 && dx * dx + dy * dy < z.core * z.core * 4) {
                        hitFighter(src, t, z.damage, (dx >= 0 ? 1 : -1) * z.impulseX, z.impulseY, z.hitstun, z.hitstop,
                            z.move, new double[] {t.x, cy});
                    }
                }
                default -> { /* BUBBLE, PULL and GHOST act elsewhere */ }
            }
            if (z.life <= 0) z.dead = true;
        }
        zones.addAll(pendingZones);
        pendingZones.clear();
    }

    /**
     * Schrödinger's box opens: until now the cat was alive AND dead. Observation picks one.
     * Alive, it pounces at the opponent; dead, the poison flask has broken and vapour spreads.
     */
    private void openBox(Zone z, FighterState t) {
        z.dead = true;
        MoveDefinition m = z.source;
        boolean alive = random(2) == 0;
        events.add(new GameEvent(GameEvent.COLLAPSE, z.owner, -1, z.move, alive ? 1 : 0, r(z.x), r(z.y)));
        if (alive) {
            Projectile cat = new Projectile(nextId++, z.owner, "cat", z.move);
            cat.dir = t.x >= z.x ? 1 : -1;
            cat.x = z.x;
            cat.y = z.y + z.h / 2;
            cat.w = 64;
            cat.h = 40;
            cat.vx = cat.dir * m.param("catSpeed", 760);
            cat.vy = m.param("catLeap", 900);
            cat.ay = -arena.gravity();
            cat.damage = z.damage;
            cat.impulseX = z.impulseX;
            cat.impulseY = z.impulseY;
            cat.hitstun = z.hitstun;
            cat.hitstop = z.hitstop;
            cat.life = 90;
            projectiles.add(cat);
        } else {
            Zone cloud = new Zone(nextId++, z.owner, Zone.CLOUD, z.move);
            cloud.x = z.x;
            cloud.w = m.param("cloudW", 300);
            cloud.h = m.param("cloudH", 260);
            cloud.y = cloud.h / 2;
            cloud.life = (int) m.param("cloudLife", 200);
            cloud.interval = (int) m.param("cloudInterval", 25);
            cloud.damage = (int) m.param("cloudDamage", 26);
            cloud.impulseX = 4000;
            cloud.impulseY = 2000;
            cloud.hitstun = 10;
            cloud.hitstop = 2;
            pendingZones.add(cloud);
        }
    }

    // ---------------------------------------------------------------- advance

    private void advance(FighterState s, FighterState opponent) {
        switch (s.action) {
            case ATTACK -> {
                s.moveFrame++;
                MoveDefinition m = s.move;
                if (m.kind() != MoveKind.NORMAL && s.moveFrame == m.startup()) {
                    if (m.kind() == MoveKind.SPECIAL) s.lastSpecial = s.moveId;
                    s.fighter.onTrigger(this, s, opponent, s.moveId, m);
                    events.add(new GameEvent(GameEvent.CAST, s.slot, -1, s.moveId, 0, r(s.x), r(s.y + s.def.body().height() / 2)));
                }
                if (s.move != null && s.moveFrame >= s.move.totalFrames()) {
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

    private void tickStatuses(FighterState s) {
        if (s.flipTicks > 0) s.flipTicks--;
        if (s.buoyTicks > 0) s.buoyTicks--;
        if (s.cageTicks > 0) s.cageTicks--;
        if (s.scrambleTicks > 0) s.scrambleTicks--;
        if (s.chillTicks > 0) s.chillTicks--;
        if (s.blindTicks > 0) s.blindTicks--;
        if (s.reflectTicks > 0) s.reflectTicks--;
        if (s.invulnTicks > 0) s.invulnTicks--;
        if (s.cooldowns[0] > 0) s.cooldowns[0]--;
        if (s.cooldowns[1] > 0) s.cooldowns[1]--;
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

    // -------------------------------------------------------------- MatchWorld

    @Override public Arena arena() { return arena; }

    @Override public int nextId() { return nextId++; }

    @Override public void spawn(Projectile p) { projectiles.add(p); }

    @Override public void spawn(Zone z) { zones.add(z); }

    @Override
    public void removeZones(int owner, String kind) {
        for (Zone z : zones) if (z.owner == owner && z.kind.equals(kind)) z.dead = true;
    }

    @Override
    public void shatter(int victimSlot, int sourceSlot, double x, double y, double speed) {
        for (Projectile p : projectiles) if (p.owner == victimSlot) p.dead = true;
        for (Zone z : zones) if (z.owner == victimSlot) z.dead = true;
        for (ArenaObject o : objects) {
            double dx = o.x - x, dy = o.centerY() - y;
            double d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) d = 1;
            o.vx = dx / d * speed;
            o.vy = Math.max(200, dy / d * speed + 300);
            o.owner = sourceSlot;
        }
        events.add(new GameEvent(GameEvent.SHATTER, sourceSlot, victimSlot, "ultimate", 0, r(x), r(y)));
    }

    @Override
    public int random(int n) {
        int x = rng;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        rng = x;
        return Integer.remainderUnsigned(x, n);
    }

    @Override
    public void condense(int victimSlot, int sourceSlot, double x, double y) {
        for (Projectile p : projectiles) if (p.owner == victimSlot) p.dead = true;
        for (ArenaObject o : objects) {
            o.vx = 0;
            o.vy = 0;
            o.owner = -1;
        }
        events.add(new GameEvent(GameEvent.CONDENSE, sourceSlot, victimSlot, "ultimate", 0, r(x), r(y)));
    }

    @Override
    public void syncZones(int owner, String kind, int ticks) {
        for (Zone z : zones) {
            if (z.dead || z.owner != owner || !z.kind.equals(kind)) continue;
            z.arm = 0;
            z.delay = z.age + ticks;
        }
    }

    @Override
    public void event(String type, int attacker, int defender, String move, double x, double y) {
        events.add(new GameEvent(type, attacker, defender, move, 0, r(x), r(y)));
    }

    /** Faraday's cage stops electric zones. */
    private static boolean electricBlocked(Zone z, FighterState target) {
        return z.electric && target.cageTicks > 0;
    }

    @Override
    public void teleport(FighterState s, double x) {
        s.x = x;
        clampToWalls(s);
    }

    // ---------------------------------------------------------------- queries

    public MatchSnapshot snapshot() {
        int timed = (phase == MatchPhase.ROUND_START || phase == MatchPhase.ROUND_END) ? phaseTicks : 0;
        List<ProjectileView> pv = new ArrayList<>(projectiles.size());
        for (Projectile p : projectiles) pv.add(p.view());
        List<ZoneView> zv = new ArrayList<>(zones.size());
        for (Zone z : zones) zv.add(z.view());
        List<ObjectView> ov = new ArrayList<>(objects.size());
        for (ArenaObject o : objects) ov.add(o.view());
        return new MatchSnapshot(tick, phase, timed, hitstop, cinematic, round, roundWinsList(), timer, lastRound,
            List.of(f[0].view(), f[1].view()), pv, zv, ov, List.copyOf(events));
    }

    public List<Integer> roundWinsList() {
        return List.of(roundWins[0], roundWins[1]);
    }

    public MatchPhase phase() { return phase; }
    public long tick() { return tick; }
    public int round() { return round; }
    public int timer() { return timer; }
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

    /** Test/tooling hook: set a fighter's energy. */
    public void setEnergy(int slot, int energy) {
        f[slot].energy = energy;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** Network rounding to 0.1 units (the TS port mirrors this exactly, including never producing -0). */
    static double r(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
