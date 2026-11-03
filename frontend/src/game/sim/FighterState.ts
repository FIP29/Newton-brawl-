import { Btn, type Action, type FighterDefinition, type FighterView, type MoveDefinition } from '../protocol';
import { centered, type Aabb } from './aabb';
import { CROUCH_HEIGHT, ENERGY_MAX, INPUT_BUFFER_TICKS } from './constants';

const isFree = (a: Action) => a === 'IDLE' || a === 'WALK' || a === 'CROUCH' || a === 'AIRBORNE';
export { isFree };

/**
 * Mirrors Java's `Math.round(v * 10) / 10.0`. Both round half up, but Java's result passes through a
 * `long`, so it can never be -0; `+ 0` turns JS's -0 into 0 to match.
 */
export const r = (v: number) => Math.round(v * 10) / 10 + 0;

export const isActiveOn = (m: MoveDefinition, frame: number) => frame >= m.startup && frame < m.startup + m.active;
export const totalFrames = (m: MoveDefinition) => m.startup + m.active + m.recovery;

/** Mirrors com.newtonbrawl.engine.sim.FighterState field-for-field. */
export class FighterState {
  x: number; y = 0; vx = 0; vy = 0;
  facing: number;
  health: number;
  energy = 0;
  grounded = true;

  action: Action = 'IDLE';
  moveId: string | null = null;
  move: MoveDefinition | null = null;
  moveFrame = 0;
  moveConnected = false;
  stunTicks = 0;

  bufferedPresses = 0;
  bufferAge = 0;

  // Status effects and timers.
  flipTicks = 0;
  buoyTicks = 0;
  cageTicks = 0;
  reflectTicks = 0;
  invulnTicks = 0;
  cooldowns: [number, number] = [0, 0];
  timeAcc = 0;
  objHitMask = 0;

  constructor(readonly slot: number, readonly def: FighterDefinition, x: number, facing: number) {
    this.x = x;
    this.facing = facing;
    this.health = def.maxHealth;
  }

  /** Rebuilds exact state from a server view (used by client-side prediction). */
  static fromView(slot: number, def: FighterDefinition, v: FighterView): FighterState {
    const s = new FighterState(slot, def, v.x, v.facing);
    s.y = v.y; s.vx = v.vx; s.vy = v.vy;
    s.health = v.health; s.energy = v.energy; s.grounded = v.grounded;
    s.action = v.action;
    s.moveId = v.move;
    s.move = v.move ? def.moves[v.move] ?? null : null;
    s.moveFrame = v.moveFrame;
    s.moveConnected = v.connected;
    s.stunTicks = v.stun;
    s.bufferedPresses = v.buffered;
    s.bufferAge = v.bufferAge;
    s.flipTicks = v.flip;
    s.buoyTicks = v.buoy;
    s.cageTicks = v.cage;
    s.reflectTicks = v.reflect;
    s.invulnTicks = v.invuln;
    s.cooldowns = [v.cd1, v.cd2];
    s.timeAcc = v.timeAcc;
    s.objHitMask = v.objHits;
    return s;
  }

  resetForRound(startX: number, startFacing: number) {
    this.x = startX; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = startFacing;
    this.health = this.def.maxHealth;
    this.grounded = true;
    this.action = 'IDLE';
    this.clearMove();
    this.stunTicks = 0;
    this.bufferedPresses = 0;
    this.bufferAge = 0;
    this.flipTicks = 0;
    this.buoyTicks = 0;
    this.cageTicks = 0;
    this.reflectTicks = 0;
    this.invulnTicks = 0;
    this.cooldowns[0] = 0;
    this.cooldowns[1] = 0;
    this.timeAcc = 0;
    this.objHitMask = 0;
  }

  addEnergy(amount: number) {
    this.energy = Math.min(ENERGY_MAX, this.energy + Math.round(amount));
  }

  halfWidth() { return this.def.body.width / 2; }

  hurtbox(): Aabb {
    const h = this.def.body.height * (this.action === 'CROUCH' ? CROUCH_HEIGHT : 1.0);
    return { x: this.x - this.halfWidth(), y: this.y, w: this.def.body.width, h };
  }

  activeHitbox(): Aabb | null {
    const m = this.move;
    if (this.action !== 'ATTACK' || !m || !m.hitbox || this.moveConnected || !isActiveOn(m, this.moveFrame)) return null;
    const b = m.hitbox;
    return centered(this.x + this.facing * b.x, this.y + b.y, b.w, b.h);
  }

  startMove(id: string) {
    const m = this.def.moves[id];
    if (!m) return;
    this.moveId = id;
    this.move = m;
    this.moveFrame = 0;
    this.moveConnected = false;
    this.objHitMask = 0;
    this.action = 'ATTACK';
  }

  bufferPresses(pressed: number) {
    const attacks = pressed & (Btn.LIGHT | Btn.HEAVY | Btn.SPECIAL | Btn.ULTIMATE);
    if (attacks !== 0) {
      this.bufferedPresses = attacks;
      this.bufferAge = 0;
    } else if (this.bufferedPresses !== 0 && ++this.bufferAge > INPUT_BUFFER_TICKS) {
      this.bufferedPresses = 0;
    }
  }

  takeBufferedPresses(): number {
    const p = this.bufferedPresses;
    this.bufferedPresses = 0;
    return p;
  }

  clearMove() {
    this.moveId = null;
    this.move = null;
    this.moveFrame = 0;
    this.moveConnected = false;
  }

  view(): FighterView {
    return {
      x: r(this.x), y: r(this.y), vx: r(this.vx), vy: r(this.vy), facing: this.facing,
      health: this.health, energy: this.energy, action: this.action, move: this.moveId,
      moveFrame: this.moveFrame, grounded: this.grounded, stun: this.stunTicks,
      connected: this.moveConnected, buffered: this.bufferedPresses, bufferAge: this.bufferAge,
      flip: this.flipTicks, reflect: this.reflectTicks, invuln: this.invulnTicks,
      cd1: this.cooldowns[0], cd2: this.cooldowns[1], timeAcc: r(this.timeAcc), objHits: this.objHitMask,
      buoy: this.buoyTicks, cage: this.cageTicks,
    };
  }
}
