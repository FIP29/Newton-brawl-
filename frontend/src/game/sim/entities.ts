/** Mirrors engine.sim.Projectile / Zone / ArenaObject field-for-field (see the Java docs for semantics). */
import type { ObjectView, ProjectileView, ZoneView } from '../protocol';
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
  effect: 'NONE' | 'GRAVITY_FLIP' = 'NONE';
  effectTicks = 0;
  reflected = false;
  dead = false;

  constructor(readonly id: number, public owner: number, readonly kind: string, readonly move: string) {}

  box(): Aabb { return centered(this.x, this.y, this.w, this.h); }

  /** Exact halving every half-life, linear in between (no pow, so Java and JS agree bit-for-bit). */
  currentDamage(): number {
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
      chains: this.chains, reflected: this.reflected };
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
  electric = false;
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

export class ArenaObject {
  y = 0; vx = 0; vy = 0;
  owner = -1;

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
