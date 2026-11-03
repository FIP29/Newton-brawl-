import { Btn, type ArenaInfo, type FighterDefinition, type GameEvent, type GameEventType, type MatchPhase,
         type MatchRules, type MoveDefinition, type RoundResult, type Snapshot } from '../protocol';
import { intersects, overlapCenter, type Aabb } from './aabb';
import { BUOY_GRAVITY, CHILL_SCALE, CINEMATIC_TICKS, DT, ENERGY_MAX, ENERGY_PER_DAMAGE_DEALT, ENERGY_PER_DAMAGE_TAKEN, FLIP_GRAVITY,
         GROUND_FRICTION, OBJECT_DANGER_SPEED, OBJECT_MASS, SLOWMO_TICKS } from './constants';
import { ArenaObject, Projectile, Zone, type ZoneKind } from './entities';
import { FighterState, isFree, r, totalFrames } from './FighterState';
import { onTrigger } from './roster';

/** Input for one fighter for one tick. Mirrors engine.input.InputFrame. */
export interface InputFrame { held: number; pressed: number }
export const NO_INPUT: InputFrame = { held: 0, pressed: 0 };

export interface MatchOutcome { winner: number; reason: 'DECISION'; ticks: number; roundWins: number[] }

/** What fighter behaviours may do to the world (mirrors engine.sim.MatchWorld). */
export interface MatchWorld {
  readonly arena: ArenaInfo;
  nextId(): number;
  spawnProjectile(p: Projectile): void;
  spawnZone(z: Zone): void;
  removeZones(owner: number, kind: ZoneKind): void;
  teleport(s: FighterState, x: number): void;
  shatter(victimSlot: number, sourceSlot: number, x: number, y: number, speed: number): void;
  /** Deterministic random integer in [0, n) (xorshift32, identical to Java). */
  random(n: number): number;
  condense(victimSlot: number, sourceSlot: number, x: number, y: number): void;
  syncZones(owner: number, kind: ZoneKind, ticks: number): void;
  event(type: GameEventType, attacker: number, defender: number, move: string | null, damage: number, x: number, y: number): void;
}

/** Hooks the per-fighter step functions need (implemented by the simulation and by the Predictor). */
export interface StepHost extends MatchWorld {
  startUltimate(s: FighterState): void;
}

/**
 * TypeScript port of com.newtonbrawl.engine.sim.MatchSimulation, used for offline local matches
 * and (via the exported step functions) client-side prediction. It must stay a method-for-method
 * mirror of the Java version; parity.test.ts replays fixtures recorded by the Java engine and
 * requires identical snapshots.
 */
export class MatchSimulation implements StepHost {
  private readonly f: [FighterState, FighterState];
  private events: GameEvent[] = [];
  private readonly roundWins = [0, 0];
  private projectiles: Projectile[] = [];
  private zones: Zone[] = [];
  private objects: ArenaObject[] = [];

  private idSeq = 1;
  tick = 0;
  phase: MatchPhase = 'ROUND_START';
  phaseTicks = 0;
  hitstop = 0;
  cinematic = 0;
  round = 1;
  timer = 0;
  lastRound: RoundResult | null = null;
  result: MatchOutcome | null = null;
  /** xorshift32 state, mirrors Java's `int rng`. */
  private rng = 0x2F6B1D3A;
  private pendingZones: Zone[] = [];

  constructor(readonly arena: ArenaInfo, defs: [FighterDefinition, FighterDefinition], readonly rules: MatchRules) {
    this.f = [new FighterState(0, defs[0], this.startX(0), +1), new FighterState(1, defs[1], this.startX(1), -1)];
    this.beginRound();
  }

  private startX(slot: number) {
    return this.arena.width * (slot === 0 ? 0.35 : 0.65);
  }

  step(in0: InputFrame, in1: InputFrame) {
    this.tick++;
    this.events = [];
    switch (this.phase) {
      case 'ROUND_START':
        this.physics(NO_INPUT, NO_INPUT);
        if (--this.phaseTicks <= 0) this.phase = 'FIGHTING';
        break;
      case 'FIGHTING': {
        const frozen = this.hitstop > 0 || this.cinematic > 0;
        this.physics(in0, in1);
        if (!frozen) this.timer--;
        this.checkRoundOver();
        break;
      }
      case 'ROUND_END': {
        const slowmo = this.result !== null && this.phaseTicks > this.rules.roundEndTicks - SLOWMO_TICKS;
        if (!slowmo || this.phaseTicks % 3 === 0) this.physics(NO_INPUT, NO_INPUT);
        if (--this.phaseTicks <= 0) {
          if (this.result) this.phase = 'FINISHED';
          else { this.round++; this.beginRound(); }
        }
        break;
      }
      case 'FINISHED':
        break;
    }
  }

  private beginRound() {
    this.f[0].resetForRound(this.startX(0), +1);
    this.f[1].resetForRound(this.startX(1), -1);
    this.projectiles = [];
    this.zones = [];
    this.objects = this.arena.objects.map((spawn) => ArenaObject.fromSpawn(this.idSeq++, spawn));
    this.hitstop = 0;
    this.cinematic = 0;
    this.timer = this.rules.roundTimeTicks;
    this.phaseTicks = this.rules.countdownTicks;
    this.phase = this.phaseTicks > 0 ? 'ROUND_START' : 'FIGHTING';
  }

  private physics(in0: InputFrame, in1: InputFrame) {
    const [a, b] = this.f;
    if (this.cinematic > 0) {
      this.cinematic--;
      a.bufferPresses(in0.pressed);
      b.bufferPresses(in1.pressed);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      a.bufferPresses(in0.pressed);
      b.bufferPresses(in1.pressed);
      return;
    }
    const actA = this.takeTimeSlice(a), actB = this.takeTimeSlice(b);
    if (actA) control(a, in0, b, this); else a.bufferPresses(in0.pressed);
    if (actB) control(b, in1, a, this); else b.bufferPresses(in1.pressed);
    if (actA) integrate(this.arena, a);
    if (actB) integrate(this.arena, b);
    separate(this.arena, a, b);
    this.applyZoneForces();
    this.updateObjects();
    this.resolveMelee();
    this.updateProjectiles();
    this.updateZones();
    if (actA) advance(a, b, this);
    if (actB) advance(b, a, this);
    tickStatuses(a);
    tickStatuses(b);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.zones = this.zones.filter((z) => !z.dead);
  }

  // ---------------------------------------------------------------- time dilation

  private timeScaleAt(px: number, py: number, slot: number): number {
    let scale = 1.0;
    for (const z of this.zones) {
      if (!z.dead && z.kind === 'BUBBLE' && z.owner !== slot && z.contains(px, py)) scale = Math.min(scale, z.timeScale);
    }
    return scale;
  }

  private takeTimeSlice(s: FighterState): boolean {
    let scale = this.timeScaleAt(s.x, s.y + s.def.body.height / 2, s.slot);
    if (s.chillTicks > 0) scale = Math.min(scale, CHILL_SCALE);
    s.timeAcc += scale;
    if (s.timeAcc >= 1.0) {
      s.timeAcc -= 1.0;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ zone forces

  private applyZoneForces() {
    for (const z of this.zones) {
      if (z.dead) continue;
      if (z.kind === 'STORM' || z.kind === 'VORTEX') {
        const t = this.f[1 - z.owner];
        const dx = z.x - t.x;
        const inside = z.contains(t.x, t.y + t.def.body.height / 2) && t.invulnTicks === 0;
        if (inside && Math.abs(dx) > 20) {
          t.x += Math.sign(dx) * z.strength * DT;
          clampToWalls(this.arena, t);
        }
        if (inside && z.kind === 'VORTEX' && t.y < z.lift) {
          t.vy = Math.max(t.vy, 520);
          t.grounded = false;
        }
        continue;
      }
      if (z.kind === 'SINGULARITY') {
        const t = this.f[1 - z.owner];
        const cy = t.y + t.def.body.height / 2;
        const dx = z.x - t.x, dy = z.y - cy, rr = z.w / 2;
        if (z.contains(t.x, cy) && Math.abs(dx) > 10 && t.invulnTicks === 0) {
          const v = z.strength * rr * rr / (dx * dx + dy * dy + rr * rr * 0.25);
          t.x += Math.sign(dx) * Math.min(Math.abs(dx), v * DT);
          clampToWalls(this.arena, t);
        }
        continue;
      }
      if (z.kind !== 'PULL') continue;
      const src = this.f[z.owner], t = this.f[1 - z.owner];
      const dx = src.x - t.x;
      if (Math.abs(dx) <= z.w / 2 && Math.abs(dx) > 110 && t.invulnTicks === 0) {
        t.x += Math.sign(dx) * z.strength * DT;
        clampToWalls(this.arena, t);
      }
      for (const o of this.objects) {
        const dxo = src.x - o.x;
        if (o.metal && Math.abs(dxo) <= z.w / 2 && Math.abs(dxo) > 60) {
          o.vx = Math.sign(dxo) * z.strength * 1.6;
          o.owner = z.owner;
        }
      }
    }
  }

  // ---------------------------------------------------------------------- objects

  private updateObjects() {
    const zeroG = this.arena.objectGravity === 0;
    const well = this.arena.well;
    for (const o of this.objects) {
      if (well) {
        const dx = well.x - o.x, dy = well.y - o.centerY(), r2 = dx * dx + dy * dy, rr = Math.sqrt(r2);
        if (rr < well.core) {
          this.event('SWALLOW', -1, -1, o.kind, 0, r(o.x), r(o.centerY()));
          o.respawn();
          continue;
        }
        const a = well.gm / (r2 + well.soft * well.soft) * DT;
        o.vx += dx / rr * a;
        o.vy += dy / rr * a;
      }
      o.vy -= this.arena.gravity * this.arena.objectGravity * DT;
      o.x += o.vx * DT;
      o.y += o.vy * DT;
      if (o.y <= 0) {
        o.y = 0;
        if (o.vy < -150 || (zeroG && o.vy < 0)) o.vy = -o.vy * this.arena.bounce; else o.vy = 0;
        if (!zeroG) {
          o.vx *= 0.9;
          if (Math.abs(o.vx) < 5) o.vx = 0;
        }
      }
      if (o.y + o.h > this.arena.height) { o.y = this.arena.height - o.h; if (o.vy > 0) o.vy = -o.vy * this.arena.bounce; }
      const half = o.w / 2;
      if (o.x < half) { o.x = half; o.vx = -o.vx * this.arena.wallBounce; }
      if (o.x > this.arena.width - half) { o.x = this.arena.width - half; o.vx = -o.vx * this.arena.wallBounce; }

      if (o.owner >= 0) {
        const speed = Math.abs(o.vx) + Math.abs(o.vy);
        const t = this.f[1 - o.owner];
        const ob = o.box(), hurt = t.hurtbox();
        if (speed > OBJECT_DANGER_SPEED && t.invulnTicks === 0 && intersects(ob, hurt)) {
          const pt = overlapCenter(ob, hurt);
          this.hitFighter(this.f[o.owner], t, 60, Math.sign(o.vx) * 26000, 14000, 16, 5, 'object', pt);
          o.vx = -o.vx * 0.3;
          o.owner = -1;
        } else if (speed < 200) {
          o.owner = -1;
        }
      }
    }
  }

  // ------------------------------------------------------------------------- hits

  private resolveMelee() {
    const [f0, f1] = this.f;
    const hit0 = f0.activeHitbox(), hit1 = f1.activeHitbox();
    const hurt0 = f0.hurtbox(), hurt1 = f1.hurtbox();
    const zeroHitsOne = hit0 !== null && f1.invulnTicks === 0 && intersects(hit0, hurt1);
    const oneHitsZero = hit1 !== null && f0.invulnTicks === 0 && intersects(hit1, hurt0);
    const m0 = f0.move, m1 = f1.move;
    const id0 = f0.moveId, id1 = f1.moveId;
    if (zeroHitsOne) this.meleeHit(f0, f1, m0!, id0!, overlapCenter(hit0!, hurt1));
    if (oneHitsZero) this.meleeHit(f1, f0, m1!, id1!, overlapCenter(hit1!, hurt0));

    for (const s of this.f) {
      const hb = s.activeHitbox();
      if (hb === null) continue;
      for (let i = 0; i < this.objects.length; i++) {
        const o = this.objects[i];
        if ((s.objHitMask & (1 << i)) !== 0 || !intersects(hb, o.interactBox())) continue;
        s.objHitMask |= 1 << i;
        const imp = s.move!.impulse ?? { x: 0, y: 0 };
        o.vx = s.facing * imp.x / OBJECT_MASS;
        o.vy = Math.max(0, imp.y / OBJECT_MASS) + 380;
        o.owner = s.slot;
        const pt = overlapCenter(hb, o.interactBox());
        this.event('CLANK', s.slot, -1, s.moveId, 0, r(pt[0]), r(pt[1]));
      }
    }
  }

  private meleeHit(atk: FighterState, def: FighterState, m: MoveDefinition, moveId: string, point: [number, number]) {
    atk.moveConnected = true;
    const imp = m.impulse ?? { x: 0, y: 0 };
    this.hitFighter(atk, def, m.damage, atk.facing * imp.x, imp.y, m.hitstun, m.hitstop, moveId, point);
  }

  /** Knockback = momentum transfer (J / m). Third Law: a reflecting target bounces the hit back. */
  private hitFighter(src: FighterState, target: FighterState, damage: number, ix: number, iy: number,
                     hitstun: number, stop: number, move: string, point: [number, number]): boolean {
    if (src !== target && this.collapse(target, src)) return false;
    if (target.reflectTicks > 0 && src !== target) {
      applyDamage(target, src, damage, -ix, iy, hitstun);
      this.hitstop = Math.max(this.hitstop, stop);
      this.event('REFLECT', target.slot, src.slot, move, damage, r(point[0]), r(point[1]));
      return false;
    }
    applyDamage(src, target, damage, ix, iy, hitstun);
    this.hitstop = Math.max(this.hitstop, stop);
    this.event('HIT', src.slot, target.slot, move, damage, r(point[0]), r(point[1]));
    return true;
  }

  /** Superposition: the first hit measures which copy was real (50/50). True = the hit is cancelled. */
  private collapse(target: FighterState, src: FighterState): boolean {
    for (const z of this.zones) {
      if (z.dead || z.owner !== target.slot || z.kind !== 'GHOST') continue;
      z.dead = true;
      const dodge = this.random(2) === 0;
      this.event('COLLAPSE', target.slot, src.slot, z.move, dodge ? 1 : 0, r(z.x), r(z.y));
      if (dodge) {
        target.x = z.x;
        clampToWalls(this.arena, target);
        target.invulnTicks = Math.max(target.invulnTicks, z.arm);
      }
      return dodge;
    }
    return false;
  }

  // ------------------------------------------------------------------ projectiles

  private updateProjectiles() {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const scale = this.timeScaleAt(p.x, p.y, p.owner);
      p.age++;
      p.life--;
      if (p.motion === 'LINEAR') {
        p.vx += p.ax * DT * scale;
        p.vy += p.ay * DT * scale;
        p.x += p.vx * DT * scale;
        p.y += p.vy * DT * scale;
      } else if (p.motion === 'PENDULUM') {
        p.omega -= p.gOverL * p.theta * DT * scale;
        p.theta += p.omega * DT * scale;
        p.x = p.pivotX + p.length * p.theta;
        p.y = p.pivotY - p.length * (1 - p.theta * p.theta * 0.5);
      } else {
        const a = this.f[p.anchor];
        p.ovx -= p.k * p.ox * DT * scale;
        p.ovy -= p.k * p.oy * DT * scale;
        p.ox += p.ovx * DT * scale;
        p.oy += p.ovy * DT * scale;
        p.x = a.x + p.ox;
        p.y = a.y + a.def.body.height * 0.55 + p.oy;
      }
      if (p.shrink > 0) {
        p.w = Math.max(p.minSize, p.w - p.shrink * scale);
        p.h = p.w;
      }
      if (p.motion === 'LINEAR' && this.bendAndSwallow(p, scale)) {
        p.dead = true;
        continue;
      }
      if (p.electric && p.chains < p.maxChains) this.chainThroughMetal(p);

      const target = this.f[1 - p.owner];
      const box = p.box(), hurt = target.hurtbox();
      if (target.invulnTicks === 0 && !p.evaded && intersects(box, hurt)) {
        const pt = overlapCenter(box, hurt);
        const evade = target.def.projectileEvade ?? 0;
        if (evade > 0 && this.random(100) < evade) {
          p.evaded = true;
          this.event('PHASE', target.slot, p.owner, p.move, 0, r(pt[0]), r(pt[1]));
          continue;
        }
        if (p.electric && target.cageTicks > 0) {
          this.event('BLOCK', target.slot, p.owner, p.move, 0, r(pt[0]), r(pt[1]));
          p.dead = true;
          continue;
        }
        if (target.reflectTicks > 0 && !p.reflected && p.motion !== 'LINEAR') {
          this.event('REFLECT', target.slot, 1 - target.slot, p.move, 0, r(pt[0]), r(pt[1]));
          p.dead = true;
          continue;
        }
        if (target.reflectTicks > 0 && !p.reflected) {
          p.owner = target.slot;
          p.vx = -p.vx;
          p.ax = -p.ax;
          p.dir = -p.dir;
          p.reflected = true;
          this.event('REFLECT', target.slot, 1 - target.slot, p.move, 0, r(pt[0]), r(pt[1]));
        } else {
          let dmg = p.currentDamage();
          let ix = p.dir * p.impulseX, iy = p.impulseY;
          if (p.effect === 'MEASURE') {
            const sign = this.random(2) === 0 ? 1 : -1;
            ix = sign * p.impulseX * (0.5 + 0.5 * this.random(3));
            iy = p.impulseY * (0.5 + 0.5 * this.random(3));
          }
          if (p.effect === 'DOPPLER') {
            const vo = -p.dir * target.vx;
            const ratio = clamp((p.waveSpeed + vo) / (p.waveSpeed - p.vs), 0.5, 2.5);
            dmg = Math.round(dmg * ratio);
          }
          let stun = p.hitstun;
          const freeze = p.effect === 'CHILL' && target.chillTicks > 0;
          if (freeze) stun = p.freezeStun;
          const landed = this.hitFighter(this.f[p.owner], target, dmg, ix, iy, stun, p.hitstop, p.move, pt);
          if (landed && p.effect === 'CHILL') {
            target.chillTicks = freeze ? 0 : p.effectTicks;
            if (freeze) this.event('FREEZE', p.owner, target.slot, p.move, 0, r(pt[0]), r(pt[1]));
          }
          if (landed && p.effect === 'GRAVITY_FLIP') target.flipTicks = p.effectTicks;
          if (landed && p.effect === 'BUOY') target.buoyTicks = p.effectTicks;
          p.dead = true;
          continue;
        }
      }
      if (p.wraps > 0 && (p.x < 0 || p.x > this.arena.width)) {
        p.x = p.x < 0 ? p.x + this.arena.width : p.x - this.arena.width;
        p.wraps--;
      }
      const hitFloor = p.y - p.h / 2 <= 0 && p.vy < 0;
      const outside = p.x < -100 || p.x > this.arena.width + 100 || p.y > this.arena.height + 200;
      if (p.life <= 0 || hitFloor || outside) p.dead = true;
    }
  }

  /** Gravitational lensing toward the arena's black hole and the opponent's singularities. True = swallowed. */
  private bendAndSwallow(p: Projectile, scale: number): boolean {
    const well = this.arena.well;
    if (well) {
      const dx = well.x - p.x, dy = well.y - p.y, r2 = dx * dx + dy * dy, rr = Math.sqrt(r2);
      if (rr < well.core) {
        this.event('SWALLOW', p.owner, -1, p.move, 0, r(p.x), r(p.y));
        return true;
      }
      const a = well.gm / (r2 + well.soft * well.soft) * DT * scale;
      p.vx += dx / rr * a;
      p.vy += dy / rr * a;
    }
    for (const z of this.zones) {
      if (z.dead || z.owner === p.owner || z.kind !== 'SINGULARITY' || !z.contains(p.x, p.y)) continue;
      const dx = z.x - p.x, dy = z.y - p.y, r2 = dx * dx + dy * dy, rr = Math.sqrt(r2), half = z.w / 2;
      if (rr < z.core) {
        this.event('SWALLOW', z.owner, p.owner, p.move, 0, r(p.x), r(p.y));
        return true;
      }
      const a = z.strength * 20 * half * half / (r2 + half * half * 0.25) * DT * scale;
      p.vx += dx / rr * a;
      p.vy += dy / rr * a;
    }
    return false;
  }

  private chainThroughMetal(p: Projectile) {
    for (const o of this.objects) {
      if (!o.metal || o.id === p.lastChainObject) continue;
      if (Math.abs(o.x - p.x) < 50 && Math.abs(o.centerY() - p.y) < 110) {
        const t = this.f[1 - p.owner];
        const dx = t.x - o.x;
        const dy = (t.y + t.def.body.height / 2) - o.centerY();
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.x = o.x;
        p.y = o.centerY();
        p.vx = dx / dist * speed;
        p.vy = dy / dist * speed;
        p.ax = 0;
        p.ay = 0;
        p.dir = dx >= 0 ? 1 : -1;
        p.chains++;
        p.damage = Math.round(p.damage * 1.25);
        p.life = Math.max(p.life, 50);
        p.lastChainObject = o.id;
        this.event('ARC', p.owner, -1, p.move, 0, r(o.x), r(o.centerY()));
        return;
      }
    }
  }

  // ------------------------------------------------------------------------ zones

  private updateZones() {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.age++;
      z.life--;
      const src = this.f[z.owner], t = this.f[1 - z.owner];
      const hurt = t.hurtbox();
      switch (z.kind) {
        case 'TRAP':
          if (z.arm > 0) {
            z.arm--;
          } else if (t.invulnTicks === 0 && t.grounded && intersects(z.box(), hurt)) {
            this.hitFighter(src, t, z.damage, 0, z.impulseY, z.hitstun, z.hitstop, z.move, overlapCenter(z.box(), hurt));
            z.dead = true;
          }
          break;
        case 'BLAST':
        case 'BEAM':
        case 'LEVER':
        case 'FOCUS':
        case 'WAVE':
        case 'BURST':
        case 'BOOM': {
          const live = z.age > z.delay && z.age <= z.delay + z.active;
          if (live && (z.hitMask & (1 << t.slot)) === 0 && t.invulnTicks === 0 && intersects(z.box(), hurt)) {
            z.hitMask |= 1 << t.slot;
            const dir = z.kind === 'BEAM' || z.kind === 'BOOM' ? z.dir : (t.x >= z.x ? 1 : -1);
            const landed = this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
              overlapCenter(z.box(), hurt));
            if (landed && z.blind > 0) t.blindTicks = z.blind;
          }
          if (z.age > z.delay + z.active) z.dead = true;
          break;
        }
        case 'FIELD':
          if (z.age % z.interval === 0 && t.invulnTicks === 0 && electricBlocked(z, t)) {
            this.event('BLOCK', t.slot, z.owner, z.move, 0, r(t.x), r(t.y + t.def.body.height * 0.6));
          } else if (z.age % z.interval === 0 && t.invulnTicks === 0) {
            const dir = t.x >= src.x ? 1 : -1;
            this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
              [t.x, t.y + t.def.body.height * 0.6]);
          }
          break;
        case 'INDUCTION':
          if (t.invulnTicks === 0 && intersects(z.box(), hurt)) {
            z.acc += (Math.abs(t.vx) + Math.abs(t.vy)) * DT * z.strength;
            if (z.acc >= z.damage) {
              z.acc -= z.damage;
              if (electricBlocked(z, t)) {
                this.event('BLOCK', t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60));
              } else {
                this.hitFighter(src, t, z.damage, (t.vx >= 0 ? 1 : -1) * z.impulseX, z.impulseY, z.hitstun, z.hitstop,
                  z.move, overlapCenter(z.box(), hurt));
              }
            }
          }
          break;
        case 'STORM':
        case 'VORTEX':
          if (z.age % z.interval === 0 && t.invulnTicks === 0 && z.contains(t.x, t.y + t.def.body.height / 2)) {
            if (electricBlocked(z, t)) {
              this.event('BLOCK', t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60));
            } else {
              const dir = t.x >= z.x ? 1 : -1;
              this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                [t.x, t.y + t.def.body.height * 0.5]);
            }
          }
          break;
        case 'SPRING':
          if (z.arm > 0) {
            z.arm--;
          } else if (t.invulnTicks === 0 && t.grounded && intersects(z.box(), hurt)) {
            const stretch = Math.min(z.maxStretch, Math.abs(src.x - z.x));
            const force = z.springK * stretch;
            const dir = src.x >= z.x ? 1 : -1;
            const dmg = z.damage + Math.round(stretch * 0.15);
            this.hitFighter(src, t, dmg, dir * force * 0.4, force, z.hitstun, z.hitstop, z.move, overlapCenter(z.box(), hurt));
            z.dead = true;
          }
          break;
        case 'CATBOX':
          if (z.age >= z.delay) this.openBox(z, t);
          break;
        case 'CLOUD':
        case 'CURRENT':
          if (z.age % z.interval === 0 && t.invulnTicks === 0 && intersects(z.box(), hurt)) {
            if (electricBlocked(z, t)) {
              this.event('BLOCK', t.slot, z.owner, z.move, 0, r(t.x), r(t.y + 60));
            } else {
              const dir = t.x >= z.x ? 1 : -1;
              this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                [t.x, t.y + t.def.body.height * 0.6]);
            }
          }
          break;
        case 'VINE':
          if (z.arm > 0) {
            z.arm--;
          } else {
            const inside = t.invulnTicks === 0 && intersects(z.box(), hurt);
            const synced = z.delay > 0;
            const moving = Math.abs(t.vx) + Math.abs(t.vy) > 60;
            if (synced ? z.age >= z.delay : inside && moving) {
              if (inside) {
                const dir = z.x >= t.x ? 1 : -1;
                this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
                  overlapCenter(z.box(), hurt));
              }
              z.dead = true;
            }
          }
          break;
        case 'UNCERTAIN':
          if (z.age % z.interval === 0 && t.invulnTicks === 0 && this.random(2) === 0) {
            const dir = this.random(2) === 0 ? 1 : -1;
            this.hitFighter(src, t, z.damage, dir * z.impulseX, z.impulseY, z.hitstun, z.hitstop, z.move,
              [t.x, t.y + t.def.body.height * 0.6]);
          }
          break;
        case 'SINGULARITY': {
          const cy = t.y + t.def.body.height / 2, dx = t.x - z.x, dy = cy - z.y;
          if (z.age % z.interval === 0 && t.invulnTicks === 0 && dx * dx + dy * dy < z.core * z.core * 4) {
            this.hitFighter(src, t, z.damage, (dx >= 0 ? 1 : -1) * z.impulseX, z.impulseY, z.hitstun, z.hitstop,
              z.move, [t.x, cy]);
          }
          break;
        }
        default:
          break;
      }
      if (z.life <= 0) z.dead = true;
    }
    this.zones.push(...this.pendingZones);
    this.pendingZones = [];
  }

  /** Schrödinger's box opens: alive → the cat pounces; dead → poison vapour. */
  private openBox(z: Zone, t: FighterState) {
    z.dead = true;
    const m = z.source!;
    const p = (key: string, fallback: number) => m.params?.[key] ?? fallback;
    const alive = this.random(2) === 0;
    this.event('COLLAPSE', z.owner, -1, z.move, alive ? 1 : 0, r(z.x), r(z.y));
    if (alive) {
      const cat = new Projectile(this.idSeq++, z.owner, 'cat', z.move);
      cat.dir = t.x >= z.x ? 1 : -1;
      cat.x = z.x;
      cat.y = z.y + z.h / 2;
      cat.w = 64;
      cat.h = 40;
      cat.vx = cat.dir * p('catSpeed', 760);
      cat.vy = p('catLeap', 900);
      cat.ay = -this.arena.gravity;
      cat.damage = z.damage;
      cat.impulseX = z.impulseX;
      cat.impulseY = z.impulseY;
      cat.hitstun = z.hitstun;
      cat.hitstop = z.hitstop;
      cat.life = 90;
      this.projectiles.push(cat);
    } else {
      const cloud = new Zone(this.idSeq++, z.owner, 'CLOUD', z.move);
      cloud.x = z.x;
      cloud.w = p('cloudW', 300);
      cloud.h = p('cloudH', 260);
      cloud.y = cloud.h / 2;
      cloud.life = Math.trunc(p('cloudLife', 200));
      cloud.interval = Math.trunc(p('cloudInterval', 25));
      cloud.damage = Math.trunc(p('cloudDamage', 26));
      cloud.impulseX = 4000;
      cloud.impulseY = 2000;
      cloud.hitstun = 10;
      cloud.hitstop = 2;
      this.pendingZones.push(cloud);
    }
  }

  private checkRoundOver() {
    const [f0, f1] = this.f;
    const ko0 = f0.health <= 0, ko1 = f1.health <= 0;
    if (ko0 || ko1) {
      if (ko0) { f0.action = 'KO'; f0.clearMove(); }
      if (ko1) { f1.action = 'KO'; f1.clearMove(); }
      this.endRound(ko0 && ko1 ? -1 : ko0 ? 1 : 0, ko0 && ko1 ? 'DOUBLE_KO' : 'KO');
    } else if (this.timer <= 0) {
      const h0 = f0.health / f0.def.maxHealth;
      const h1 = f1.health / f1.def.maxHealth;
      this.endRound(h0 > h1 ? 0 : h1 > h0 ? 1 : -1, 'TIME');
    }
  }

  private endRound(winner: number, reason: RoundResult['reason']) {
    if (winner >= 0) this.roundWins[winner]++;
    this.lastRound = { round: this.round, winner, reason };
    this.phase = 'ROUND_END';
    this.phaseTicks = this.rules.roundEndTicks;
    const [w0, w1] = this.roundWins;
    if (w0 >= this.rules.roundsToWin || w1 >= this.rules.roundsToWin || this.round >= this.rules.maxRounds) {
      this.result = { winner: w0 > w1 ? 0 : w1 > w0 ? 1 : -1, reason: 'DECISION', ticks: this.tick, roundWins: [w0, w1] };
    }
  }

  // ------------------------------------------------------------- MatchWorld/StepHost

  nextId() { return this.idSeq++; }
  spawnProjectile(p: Projectile) { this.projectiles.push(p); }
  spawnZone(z: Zone) { this.zones.push(z); }
  removeZones(owner: number, kind: ZoneKind) {
    for (const z of this.zones) if (z.owner === owner && z.kind === kind) z.dead = true;
  }
  teleport(s: FighterState, x: number) {
    s.x = x;
    clampToWalls(this.arena, s);
  }
  shatter(victimSlot: number, sourceSlot: number, x: number, y: number, speed: number) {
    for (const p of this.projectiles) if (p.owner === victimSlot) p.dead = true;
    for (const z of this.zones) if (z.owner === victimSlot) z.dead = true;
    for (const o of this.objects) {
      const dx = o.x - x, dy = o.centerY() - y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1) d = 1;
      o.vx = dx / d * speed;
      o.vy = Math.max(200, dy / d * speed + 300);
      o.owner = sourceSlot;
    }
    this.event('SHATTER', sourceSlot, victimSlot, 'ultimate', 0, r(x), r(y));
  }
  condense(victimSlot: number, sourceSlot: number, x: number, y: number) {
    for (const p of this.projectiles) if (p.owner === victimSlot) p.dead = true;
    for (const o of this.objects) { o.vx = 0; o.vy = 0; o.owner = -1; }
    this.event('CONDENSE', sourceSlot, victimSlot, 'ultimate', 0, r(x), r(y));
  }
  syncZones(owner: number, kind: ZoneKind, ticks: number) {
    for (const z of this.zones) {
      if (z.dead || z.owner !== owner || z.kind !== kind) continue;
      z.arm = 0;
      z.delay = z.age + ticks;
    }
  }
  random(n: number): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return (x >>> 0) % n;
  }
  startUltimate(s: FighterState) {
    this.cinematic = CINEMATIC_TICKS;
    this.event('ULTIMATE', s.slot, -1, 'ultimate', 0, r(s.x), r(s.y + s.def.body.height / 2));
  }
  event(type: GameEventType, attacker: number, defender: number, move: string | null, damage: number, x: number, y: number) {
    this.events.push({ type, attacker, defender, move, damage, x, y });
  }

  snapshot(): Snapshot {
    const timed = this.phase === 'ROUND_START' || this.phase === 'ROUND_END' ? this.phaseTicks : 0;
    return {
      tick: this.tick, phase: this.phase, phaseTicks: timed, hitstop: this.hitstop, cinematic: this.cinematic,
      round: this.round, roundWins: [...this.roundWins], timer: this.timer, lastRound: this.lastRound,
      fighters: [this.f[0].view(), this.f[1].view()],
      projectiles: this.projectiles.map((p) => p.view()),
      zones: this.zones.map((z) => z.view()),
      objects: this.objects.map((o) => o.view()),
      events: [...this.events],
    };
  }

  fighter(slot: number) { return this.f[slot]; }

  /** Test/tooling hook (mirrors Java setEnergy). */
  setEnergy(slot: number, energy: number) { this.f[slot].energy = energy; }
}

// ---------------------------------------------------------------------------------------------
// Per-fighter step functions, shared by the full simulation and by the online Predictor.

export function control(s: FighterState, raw: InputFrame, opponent: FighterState, host: StepHost) {
  if (!isFree(s.action) || s.buoyTicks > 0) {
    s.bufferPresses(raw.pressed);
    return;
  }
  const inp: InputFrame = { held: raw.held, pressed: raw.pressed | s.takeBufferedPresses() };
  let dir = ((inp.held & Btn.RIGHT) ? 1 : 0) - ((inp.held & Btn.LEFT) ? 1 : 0);
  if (s.scrambleTicks > 0) dir = -dir;

  if (s.grounded) {
    if (s.blindTicks === 0) s.facing = opponent.x >= s.x ? 1 : -1;
    if (tryAttack(s, inp, host)) {
      s.vx *= 0.3;
      return;
    }
    if (inp.held & Btn.UP) {
      s.vy = s.def.jumpVelocity;
      s.vx = dir * s.def.walkSpeed;
      s.grounded = false;
      s.action = 'AIRBORNE';
    } else if (inp.held & Btn.DOWN) {
      s.vx = 0;
      s.action = 'CROUCH';
    } else {
      s.vx = dir * s.def.walkSpeed;
      s.action = dir === 0 ? 'IDLE' : 'WALK';
    }
  } else {
    if (tryAttack(s, inp, host)) return;
    const max = s.def.walkSpeed;
    s.vx = clamp(s.vx + dir * s.def.airAcceleration * DT, -max, max);
  }
}

function tryAttack(s: FighterState, inp: InputFrame, host: StepHost): boolean {
  const ultPress = (inp.pressed & Btn.ULTIMATE) !== 0
    || ((inp.pressed & Btn.SPECIAL) !== 0 && (inp.held & Btn.HEAVY) !== 0)
    || ((inp.pressed & Btn.HEAVY) !== 0 && (inp.held & Btn.SPECIAL) !== 0);
  const canSee = s.blindTicks === 0;
  if (canSee && ultPress && s.energy >= ENERGY_MAX && s.def.moves.ultimate) {
    s.startMove('ultimate');
    s.energy = 0;
    host.startUltimate(s);
    return true;
  }
  if (canSee && (inp.pressed & Btn.SPECIAL)) {
    const idx = (inp.held & Btn.DOWN) ? 1 : 0;
    const id = idx === 0 ? 'special1' : 'special2';
    const m = s.def.moves[id];
    if (m && s.cooldowns[idx] === 0) {
      s.startMove(id);
      s.cooldowns[idx] = m.cooldown ?? 0;
      return true;
    }
  }
  const move = (inp.pressed & Btn.HEAVY) ? 'heavy' : (inp.pressed & Btn.LIGHT) ? 'light' : null;
  if (move === null || !s.def.moves[move]) return false;
  s.startMove(move);
  return true;
}

export function integrate(arena: ArenaInfo, s: FighterState) {
  const gScale = s.flipTicks > 0 ? FLIP_GRAVITY : s.buoyTicks > 0 ? BUOY_GRAVITY : 1.0;
  const flipped = gScale < 0;
  const g = arena.gravity * gScale;
  s.vy -= g * DT;
  s.x += s.vx * DT;
  s.y += s.vy * DT;
  const well = arena.well;
  if (well && Math.abs(well.x - s.x) > 30) s.x += Math.sign(well.x - s.x) * well.drift * DT;

  if (flipped) {
    s.grounded = false;
    if (s.action === 'IDLE' || s.action === 'WALK' || s.action === 'CROUCH') s.action = 'AIRBORNE';
    if (s.y < 0) {
      s.y = 0;
      if (s.vy < 0) s.vy = 0;
    }
  } else if (s.y <= 0) {
    s.y = 0;
    if (s.vy < 0) s.vy = 0;
    if (!s.grounded) {
      s.grounded = true;
      if (s.action === 'AIRBORNE') s.action = 'IDLE';
    }
  } else {
    s.grounded = false;
  }
  const top = arena.height - s.def.body.height;
  if (s.y > top) {
    s.y = top;
    if (s.vy > 0) s.vy = 0;
  }
  if (s.grounded && (s.action === 'ATTACK' || s.action === 'HITSTUN' || s.action === 'KO')) {
    s.vx *= GROUND_FRICTION;
  }
  clampToWalls(arena, s);
}

export function clampToWalls(arena: ArenaInfo, s: FighterState) {
  const min = s.halfWidth(), max = arena.width - s.halfWidth();
  if (s.x < min) { s.x = min; s.vx = Math.max(0, s.vx); }
  if (s.x > max) { s.x = max; s.vx = Math.min(0, s.vx); }
}

export function separate(arena: ArenaInfo, a: FighterState, b: FighterState) {
  const ha = a.hurtbox(), hb = b.hurtbox();
  const verticalOverlap = ha.y < hb.y + hb.h && hb.y < ha.y + ha.h;
  if (!verticalOverlap) return;
  const dx = b.x - a.x;
  const minDist = a.halfWidth() + b.halfWidth();
  const overlap = minDist - Math.abs(dx);
  if (overlap <= 0) return;
  const sign = dx !== 0 ? Math.sign(dx) : a.facing;
  a.x -= sign * overlap / 2;
  b.x += sign * overlap / 2;
  clampToWalls(arena, a);
  clampToWalls(arena, b);
  const remaining = minDist - Math.abs(b.x - a.x);
  if (remaining > 1e-9) {
    const aPinned = a.x <= a.halfWidth() + 1e-9 || a.x >= arena.width - a.halfWidth() - 1e-9;
    if (aPinned) b.x += sign * remaining; else a.x -= sign * remaining;
    clampToWalls(arena, a);
    clampToWalls(arena, b);
  }
}

export function advance(s: FighterState, opponent: FighterState, host: StepHost) {
  if (s.action === 'ATTACK') {
    s.moveFrame++;
    const m = s.move!;
    if ((m.kind ?? 'NORMAL') !== 'NORMAL' && s.moveFrame === m.startup) {
      if (m.kind === 'SPECIAL') s.lastSpecial = s.moveId;
      onTrigger(host, s, opponent, s.moveId!, m);
      host.event('CAST', s.slot, -1, s.moveId, 0, r(s.x), r(s.y + s.def.body.height / 2));
    }
    if (s.move && s.moveFrame >= totalFrames(s.move)) {
      s.clearMove();
      s.action = s.grounded ? 'IDLE' : 'AIRBORNE';
    }
  } else if (s.action === 'HITSTUN') {
    if (--s.stunTicks <= 0) s.action = s.grounded ? 'IDLE' : 'AIRBORNE';
  }
}

export function tickStatuses(s: FighterState) {
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

function applyDamage(src: FighterState, target: FighterState, damage: number, ix: number, iy: number, hitstun: number) {
  target.health = Math.max(0, target.health - damage);
  src.addEnergy(damage * ENERGY_PER_DAMAGE_DEALT);
  target.addEnergy(damage * ENERGY_PER_DAMAGE_TAKEN);
  target.clearMove();
  target.action = 'HITSTUN';
  target.stunTicks = hitstun;
  target.vx = ix / target.def.mass;
  target.vy = iy / target.def.mass;
  if (target.vy > 0) target.grounded = false;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const electricBlocked = (z: Zone, t: FighterState) => z.electric && t.cageTicks > 0;

export type { Aabb };
