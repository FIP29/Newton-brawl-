import type { ArenaInfo, FighterDefinition, FighterView, StateMessage } from '../protocol';
import { CINEMATIC_TICKS } from '../sim/constants';
import { FighterState } from '../sim/FighterState';
import { advance, clampToWalls, control, integrate, separate, tickStatuses, type InputFrame,
         type StepHost } from '../sim/MatchSimulation';

interface PendingInput { seq: number; bits: number }

/**
 * Client-side prediction + server reconciliation for the local player's fighter.
 *
 * Every input we send is applied to a local copy of our fighter straight away, so our own
 * movement responds instantly instead of waiting a round trip. Each server snapshot tells us
 * the last input seq it applied (`ack`); we rewind to that authoritative state and replay the
 * inputs the server hasn't processed yet, using the exact same step functions as the server
 * (the TS port is parity-tested against Java). If the result differs from what we were showing
 * (e.g. we got hit), the visual error is blended away over ~100 ms instead of snapping.
 *
 * Hits, projectiles and zones are never predicted: they only ever come from the server. Our own
 * specials still animate (and Light Dash still blinks) instantly. Prediction pauses while we're
 * under effects it can't model locally (flipped gravity, inside a time-dilation bubble).
 */
export class Predictor implements StepHost {
  private self: FighterState | null = null;
  private opponent: FighterState | null = null;
  private pending: PendingInput[] = [];
  private ackedBits = 0;
  private lastBits = 0;
  private hitstop = 0;
  private cinematic = 0;
  private active = false;
  private err = { x: 0, y: 0 };

  /** Size of the most recent correction in world units (0 = prediction was exact). For tests/debug. */
  lastCorrection = 0;

  private static readonly SNAP_DISTANCE = 220;
  private static readonly MAX_PENDING = 120;

  constructor(readonly arena: ArenaInfo, private readonly defs: FighterDefinition[],
              private readonly slot: number) {}

  /** True while prediction is driving our fighter (only during FIGHTING). */
  get isActive() { return this.active && this.self !== null; }

  /** Call for every input packet sent, in order. */
  onInputSent(seq: number, bits: number) {
    this.pending.push({ seq, bits });
    if (this.pending.length > Predictor.MAX_PENDING) this.pending.shift();
    if (this.isActive) this.stepWith(bits);
    else this.lastBits = bits;
  }

  /** Call for every authoritative snapshot, in arrival order. */
  onServerState(msg: StateMessage) {
    const ack = msg.ack[this.slot];
    while (this.pending.length && this.pending[0].seq <= ack) this.ackedBits = this.pending.shift()!.bits;

    const me = msg.fighters[this.slot];
    const inBubble = msg.zones.some((z) => z.kind === 'BUBBLE' && z.owner !== this.slot
      && Math.abs(me.x - z.x) <= z.w / 2 + 60 && Math.abs(me.y + this.defs[this.slot].body.height / 2 - z.y) <= z.h / 2 + 60);
    this.active = msg.phase === 'FIGHTING' && me.action !== 'KO' && me.flip === 0 && me.buoy === 0 && me.chill === 0 && !inBubble;
    if (!this.active) {
      this.self = null;
      this.err.x = this.err.y = 0;
      return;
    }

    const before = this.self ? { x: this.self.x, y: this.self.y } : null;
    const other = 1 - this.slot;
    this.self = FighterState.fromView(this.slot, this.defs[this.slot], msg.fighters[this.slot]);
    this.opponent = FighterState.fromView(other, this.defs[other], msg.fighters[other]);
    this.hitstop = msg.hitstop;
    this.cinematic = msg.cinematic;

    // Replay everything the server hasn't applied yet.
    this.lastBits = this.ackedBits;
    for (const p of this.pending) this.stepWith(p.bits);

    if (before) {
      const dx = before.x - this.self.x, dy = before.y - this.self.y;
      this.lastCorrection = Math.hypot(dx, dy);
      if (this.lastCorrection > Predictor.SNAP_DISTANCE) { this.err.x = this.err.y = 0; }
      else { this.err.x += dx; this.err.y += dy; }
    }
  }

  /** Our fighter as it should be drawn now, with correction smoothing applied. */
  view(dtMs: number): FighterView | null {
    if (!this.isActive) return null;
    const k = Math.exp(-dtMs / 1000 * 18);
    this.err.x *= k;
    this.err.y *= k;
    const v = this.self!.view();
    return { ...v, x: v.x + this.err.x, y: Math.max(0, v.y + this.err.y) };
  }

  private stepWith(bits: number) {
    const input: InputFrame = { held: bits, pressed: bits & ~this.lastBits };
    this.lastBits = bits;
    const s = this.self!, o = this.opponent!;
    if (this.cinematic > 0) {
      this.cinematic--;
      s.bufferPresses(input.pressed);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      s.bufferPresses(input.pressed);
      return;
    }
    // Mirror the simulation's time slice at scale 1 (keeps timeAcc bit-identical).
    s.timeAcc += 1.0;
    if (s.timeAcc >= 1.0) s.timeAcc -= 1.0;
    control(s, input, o, this);
    integrate(this.arena, s);
    // The opponent's position is authoritative; we only resolve our side of the push.
    const ox = o.x;
    separate(this.arena, s, o);
    o.x = ox;
    advance(s, o, this);
    tickStatuses(s);
  }

  // StepHost: our own spawns/events are discarded — the server's versions arrive in snapshots.
  nextId() { return 0; }
  spawnProjectile() {}
  spawnZone() {}
  removeZones() {}
  teleport(s: FighterState, x: number) { s.x = x; clampToWalls(this.arena, s); }
  shatter() {}
  /** Randomness only matters for hits, which the server decides; teleport guesses are corrected on the next snapshot. */
  random() { return 0; }
  startUltimate() { this.cinematic = CINEMATIC_TICKS; }
  event() {}
  condense() {}
  syncZones() {}
}
