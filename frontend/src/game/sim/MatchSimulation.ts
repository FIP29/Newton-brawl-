import { Btn, type ArenaInfo, type FighterDefinition, type HitEvent, type MatchPhase, type MatchRules,
         type RoundResult, type Snapshot } from '../protocol';
import { intersects, overlapCenter } from './aabb';
import { DT, ENERGY_PER_DAMAGE_DEALT, ENERGY_PER_DAMAGE_TAKEN, GROUND_FRICTION } from './constants';
import { FighterState, isFree, r as round1, totalFrames } from './FighterState';

/** Input for one fighter for one tick. Mirrors engine.input.InputFrame. */
export interface InputFrame { held: number; pressed: number }
export const NO_INPUT: InputFrame = { held: 0, pressed: 0 };

export interface MatchOutcome { winner: number; reason: 'DECISION'; ticks: number; roundWins: number[] }

/**
 * TypeScript port of com.newtonbrawl.engine.sim.MatchSimulation. Used for:
 *  - offline local 2-player matches (runs the whole game in the browser)
 *  - client-side prediction of your own fighter online (via the shared step functions below)
 *
 * It must stay a line-for-line mirror of the Java version; `parity.test.ts` replays a fixture
 * recorded by the Java engine and requires identical snapshots.
 */
export class MatchSimulation {
  private readonly f: [FighterState, FighterState];
  private events: HitEvent[] = [];
  private readonly roundWins = [0, 0];

  tick = 0;
  phase: MatchPhase = 'ROUND_START';
  phaseTicks = 0;
  hitstop = 0;
  round = 1;
  timer = 0;
  lastRound: RoundResult | null = null;
  result: MatchOutcome | null = null;

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
        const frozen = this.hitstop > 0;
        this.physics(in0, in1);
        if (!frozen) this.timer--;
        this.checkRoundOver();
        break;
      }
      case 'ROUND_END':
        this.physics(NO_INPUT, NO_INPUT);
        if (--this.phaseTicks <= 0) {
          if (this.result) this.phase = 'FINISHED';
          else { this.round++; this.beginRound(); }
        }
        break;
      case 'FINISHED':
        break;
    }
  }

  private beginRound() {
    this.f[0].resetForRound(this.startX(0), +1);
    this.f[1].resetForRound(this.startX(1), -1);
    this.hitstop = 0;
    this.timer = this.rules.roundTimeTicks;
    this.phaseTicks = this.rules.countdownTicks;
    this.phase = this.phaseTicks > 0 ? 'ROUND_START' : 'FIGHTING';
  }

  private physics(in0: InputFrame, in1: InputFrame) {
    const [a, b] = this.f;
    if (this.hitstop > 0) {
      this.hitstop--;
      a.bufferPresses(in0.pressed);
      b.bufferPresses(in1.pressed);
      return;
    }
    control(a, in0, b);
    control(b, in1, a);
    integrate(this.arena, a);
    integrate(this.arena, b);
    separate(this.arena, a, b);
    this.resolveHits();
    advance(a);
    advance(b);
  }

  private resolveHits() {
    const [f0, f1] = this.f;
    const hit0 = f0.activeHitbox(), hit1 = f1.activeHitbox();
    const hurt0 = f0.hurtbox(), hurt1 = f1.hurtbox();
    const zeroHitsOne = hit0 !== null && intersects(hit0, hurt1);
    const oneHitsZero = hit1 !== null && intersects(hit1, hurt0);
    if (zeroHitsOne) this.applyHit(f0, f1, overlapCenter(hit0!, hurt1));
    if (oneHitsZero) this.applyHit(f1, f0, overlapCenter(hit1!, hurt0));
  }

  /** Knockback = momentum transfer: defender velocity = impulse / mass. */
  private applyHit(atk: FighterState, def: FighterState, point: [number, number]) {
    const m = atk.move!;
    const moveId = atk.moveId!;
    atk.moveConnected = true;

    def.health = Math.max(0, def.health - m.damage);
    atk.addEnergy(m.damage * ENERGY_PER_DAMAGE_DEALT);
    def.addEnergy(m.damage * ENERGY_PER_DAMAGE_TAKEN);
    def.clearMove();
    def.action = 'HITSTUN';
    def.stunTicks = m.hitstun;
    def.vx = atk.facing * m.impulse.x / def.def.mass;
    def.vy = m.impulse.y / def.def.mass;
    if (def.vy > 0) def.grounded = false;

    this.hitstop = Math.max(this.hitstop, m.hitstop);
    this.events.push({ attacker: atk.slot, defender: def.slot, move: moveId, damage: m.damage,
                       x: round1(point[0]), y: round1(point[1]) });
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

  snapshot(): Snapshot {
    const timed = this.phase === 'ROUND_START' || this.phase === 'ROUND_END' ? this.phaseTicks : 0;
    return {
      tick: this.tick, phase: this.phase, phaseTicks: timed, hitstop: this.hitstop,
      round: this.round, roundWins: [...this.roundWins], timer: this.timer, lastRound: this.lastRound,
      fighters: [this.f[0].view(), this.f[1].view()], events: [...this.events],
    };
  }

  fighter(slot: number) { return this.f[slot]; }
}

// ---------------------------------------------------------------------------------------------
// Per-fighter step functions, shared by the full simulation and by the online Predictor.

export function control(s: FighterState, raw: InputFrame, opponent: FighterState) {
  if (!isFree(s.action)) {
    s.bufferPresses(raw.pressed);
    return;
  }
  const inp: InputFrame = { held: raw.held, pressed: raw.pressed | s.takeBufferedPresses() };
  const dir = ((inp.held & Btn.RIGHT) ? 1 : 0) - ((inp.held & Btn.LEFT) ? 1 : 0);

  if (s.grounded) {
    s.facing = opponent.x >= s.x ? 1 : -1;
    if (tryAttack(s, inp)) {
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
    if (tryAttack(s, inp)) return;
    const max = s.def.walkSpeed;
    s.vx = clamp(s.vx + dir * s.def.airAcceleration * DT, -max, max);
  }
}

function tryAttack(s: FighterState, inp: InputFrame): boolean {
  const move = (inp.pressed & Btn.HEAVY) ? 'heavy' : (inp.pressed & Btn.LIGHT) ? 'light' : null;
  if (move === null || !s.def.moves[move]) return false;
  s.startMove(move);
  return true;
}

export function integrate(arena: ArenaInfo, s: FighterState) {
  s.vy -= arena.gravity * DT;
  s.x += s.vx * DT;
  s.y += s.vy * DT;

  if (s.y <= 0) {
    s.y = 0;
    if (s.vy < 0) s.vy = 0;
    if (!s.grounded) {
      s.grounded = true;
      if (s.action === 'AIRBORNE') s.action = 'IDLE';
    }
  } else {
    s.grounded = false;
  }
  if (s.grounded && (s.action === 'ATTACK' || s.action === 'HITSTUN' || s.action === 'KO')) {
    s.vx *= GROUND_FRICTION;
  }
  clampToWalls(arena, s);
}

function clampToWalls(arena: ArenaInfo, s: FighterState) {
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

export function advance(s: FighterState) {
  if (s.action === 'ATTACK') {
    s.moveFrame++;
    if (s.moveFrame >= totalFrames(s.move!)) {
      s.clearMove();
      s.action = s.grounded ? 'IDLE' : 'AIRBORNE';
    }
  } else if (s.action === 'HITSTUN') {
    if (--s.stunTicks <= 0) s.action = s.grounded ? 'IDLE' : 'AIRBORNE';
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
