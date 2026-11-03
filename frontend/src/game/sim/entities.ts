/** Mirrors engine.sim.Projectile / Zone / ArenaObject field-for-field (see the Java docs for semantics). */
import type { MoveDefinition, ObjectView, ProjectileView, ZoneView } from '../protocol';
import { centered, type Aabb } from './aabb';
import { OBJECT_INTERACT_HEIGHT } from './constants';
import { r } from './FighterState';

export class Projectile {
  x = 0; y = 0; vx = 0; vy = 0; ax = 0; ay = 0; w = 30; h = 30;
  dir = 1;
  damage = 0; hitstun = 0; hitstop = 0;
  impulseX = 0; impulseY = 0;
  life = 120; age = 0;
  halfLife = 0;
  electric = false;
  chains = 0; maxChains = 0; lastChainObject = -1;
  effect: 'NONE' | 'GRAVITY_FLIP' | 'BUOY' | 'MEASURE' | 'DOPPLER' = 'NONE';
  effectTicks = 0;
  reflected = false;
  /** LINEAR integrates v and a; PENDULUM swings under θ'' = −(g/L)θ; ORBIT circles the anchor under a = −ω²r. */
  motion: 'LINEAR' | 'PENDULUM' | 'ORBIT' = 'LINEAR';
  pivotX = 0; pivotY = 0; length = 0; theta = 0; omega = 0; gOverL = 0;
  anchor = -1; ox = 0; oy = 0; ovx = 0; ovy = 0; k = 0;
  /** Evaporating black hole: shrinks by `shrink` per tick to `minSize`; damage ∝ size0 / size. */
  shrink = 0; size0 = 0; minSize = 0;
  /** DOPPLER: wave speed c and source velocity toward the target at emission. */
  waveSpeed = 0; vs = 0;
  dead = false;

  constructor(readonly id: number, public owner: number, readonly kind: string, readonly move: string) {}

  box(): Aabb { return centered(this.x, this.y, this.w, this.h); }

  /** Exact halving every half-life, linear in between (no pow, so Java and JS agree bit-for-bit). */
  currentDamage(): number {
    if (this.size0 > 0) return Math.round(this.damage * this.size0 / this.w);
    if (this.halfLife <= 0) return this.damage;
    const n = Math.min(Math.trunc(this.age / this.halfLife), 30);
    const frac = (this.age % this.halfLife) / this.halfLife;
    let f = 1.0;
    for (let i = 0; i < n; i++) f *= 0.5;
    f *= 1.0 - frac * 0.5;
    return Math.round(this.damage * f);
  }

  view(): ProjectileView {
    return { id: this.id, owner: this.owner, kind: this.kind, move: this.move, x: r(this.x), y: r(this.y),
      vx: r(this.vx), vy: r(this.vy), w: this.w, h: this.h, damage: this.currentDamage(), age: this.age,
      chains: this.chains, reflected: this.reflected, px: r(this.pivotX), py: r(this.pivotY) };
  }
}

export type ZoneKind = ZoneView['kind'];

export class Zone {
  x = 0; y = 0; w = 0; h = 0;
  dir = 1;
  life = 60; age = 0;
  delay = 0; active = 1; arm = 0; interval = 20;
  damage = 0; hitstun = 0; hitstop = 0;
  impulseX = 0; impulseY = 0;
  strength = 0; timeScale = 1.0;
  /** INDUCTION: accumulated charge. SPRING: k and maximum stretch. */
  acc = 0; springK = 0; maxStretch = 0;
  /** SINGULARITY event-horizon radius; GHOST uses `arm` as post-dodge invulnerability. */
  core = 0;
  electric = false;
  /** The move that created it (CATBOX reads its outcome parameters from here). */
  source: MoveDefinition | null = null;
  hitMask = 0;
  dead = false;

  constructor(readonly id: number, readonly owner: number, readonly kind: ZoneKind, readonly move: string) {}

  box(): Aabb { return centered(this.x, this.y, this.w, this.h); }

  contains(px: number, py: number): boolean {
    return Math.abs(px - this.x) <= this.w / 2 && Math.abs(py - this.y) <= this.h / 2;
  }

  view(): ZoneView {
    return { id: this.id, owner: this.owner, kind: this.kind, move: this.move, x: r(this.x), y: r(this.y),
      w: this.w, h: this.h, age: this.age, life: this.life, delay: this.delay, active: this.active, armed: this.arm === 0 };
  }
}

import type { ObjectSpawn } from '../protocol';

export class ArenaObject {
  static fromSpawn(id: number, s: ObjectSpawn): ArenaObject {
    const o = new ArenaObject(id, s.kind, s.metal, s.x, s.w, s.h);
    o.spawn = s;
    o.respawn();
    return o;
  }

  y = 0; vx = 0; vy = 0;
  owner = -1;
  spawn: ObjectSpawn | null = null;

  respawn() {
    const s = this.spawn!;
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
    this.owner = -1;
  }

  constructor(readonly id: number, readonly kind: string, readonly metal: boolean, public x: number,
              readonly w: number, readonly h: number) {}

  box(): Aabb { return { x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h }; }

  interactBox(): Aabb { return { x: this.x - this.w / 2, y: this.y, w: this.w, h: Math.max(this.h, OBJECT_INTERACT_HEIGHT) }; }

  centerY() { return this.y + this.h / 2; }

  view(): ObjectView {
    return { id: this.id, kind: this.kind, x: r(this.x), y: r(this.y), vx: r(this.vx), vy: r(this.vy),
      w: this.w, h: this.h, owner: this.owner };
  }
}
