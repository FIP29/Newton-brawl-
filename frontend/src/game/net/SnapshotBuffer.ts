import { TICK_MS, type FighterView, type ObjectView, type ProjectileView, type StateMessage } from '../protocol';

/**
 * Buffers authoritative snapshots and samples them slightly in the past so motion is smooth
 * even when packets arrive unevenly (entity interpolation).
 *
 * We keep an estimate of the server's tick clock: `serverTick ≈ now / TICK_MS + offset`, tracking
 * the earliest arrivals. Rendering happens at `serverTick − delay`, interpolating between the two
 * snapshots that bracket that moment.
 *
 * The delay adapts to the connection: it is the worst lateness seen over the last few seconds plus
 * a small margin (3 ticks = 50 ms on a clean line, up to 12 ticks = 200 ms on a bursty one). A small
 * server CPU, Wi-Fi or a busy route deliver snapshots in clumps; with a fixed 50 ms delay the buffer
 * ran dry in every clump and the fighters froze, then jumped. The delay grows quickly and shrinks
 * slowly, by gently slowing or speeding the playback clock, so the change itself is invisible.
 * If the buffer still runs dry, fighters are extrapolated for up to 4 ticks instead of freezing.
 */
export class SnapshotBuffer {
  static readonly MIN_DELAY = 3;
  static readonly MAX_DELAY = 12;
  /** Kept for callers/tests that read the old constant: the starting delay. */
  static readonly DELAY_TICKS = SnapshotBuffer.MIN_DELAY;
  private static readonly CAPACITY = 90;
  private static readonly JITTER_WINDOW_MS = 3000;
  private static readonly MAX_EXTRAPOLATE = 4;

  private readonly snaps: StateMessage[] = [];
  private offset: number | null = null;
  private lateness: Array<[number, number]> = []; // [arrival ms, ticks late]
  private delay = SnapshotBuffer.MIN_DELAY;
  private lastRenderAt: number | null = null;

  push(s: StateMessage, now: number) {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.tick <= last.tick) return; // stale / duplicate
    this.snaps.push(s);
    if (this.snaps.length > SnapshotBuffer.CAPACITY) this.snaps.shift();

    const target = s.tick - now / TICK_MS;
    if (this.offset === null || Math.abs(target - this.offset) > 30) {
      this.offset = target; // first packet or big discontinuity: snap
      this.lateness = [];
    } else if (target > this.offset) {
      this.offset += (target - this.offset) * 0.25; // arrived early: catch up quickly
    } else {
      this.offset += (target - this.offset) * 0.02; // arrived late: drift slowly
    }
    // How late this snapshot is against the clock estimate (0 for the earliest arrivals).
    this.lateness.push([now, Math.max(0, this.offset - target)]);
    const cutoff = now - SnapshotBuffer.JITTER_WINDOW_MS;
    while (this.lateness.length && this.lateness[0][0] < cutoff) this.lateness.shift();
  }

  /** Current interpolation delay in ticks (for the debug overlay and tests). */
  get delayTicks(): number { return this.delay; }

  private targetDelay(): number {
    let worst = 0;
    for (const [, late] of this.lateness) if (late > worst) worst = late;
    return Math.min(SnapshotBuffer.MAX_DELAY, Math.max(SnapshotBuffer.MIN_DELAY, worst + 1.5));
  }

  latest(): StateMessage | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  /** Fractional tick to render at `now`. Call once per frame: it also eases the delay toward its target. */
  renderTick(now: number): number {
    if (this.offset === null) return 0;
    const dt = this.lastRenderAt === null ? 0 : Math.min(100, Math.max(0, now - this.lastRenderAt));
    this.lastRenderAt = now;
    const target = this.targetDelay();
    // Up: about 6 ticks per second (playback 10 % slower for a moment). Down: about 1 tick per second.
    const step = (target > this.delay ? 0.1 : 0.017) * (dt / TICK_MS);
    this.delay += Math.max(-step, Math.min(step, target - this.delay));
    return now / TICK_MS + this.offset - this.delay;
  }

  /** Snapshots with tick in (afterTick, uptoTick], oldest first. Used to fire events in sync with visuals. */
  between(afterTick: number, uptoTick: number): StateMessage[] {
    return this.snaps.filter((s) => s.tick > afterTick && s.tick <= uptoTick);
  }

  /** Interpolated fighters at a fractional tick, plus the snapshot at or before it. */
  sample(tick: number): Sample | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    const hold = (s: StateMessage): Sample => ({ fighters: s.fighters, projectiles: s.projectiles, objects: s.objects, base: s });
    if (tick <= this.snaps[0].tick) return hold(this.snaps[0]);
    for (let i = n - 1; i >= 0; i--) {
      const a = this.snaps[i];
      if (a.tick > tick) continue;
      const b = this.snaps[i + 1];
      if (!b) return this.extrapolate(a, tick) ?? hold(a);
      const t = (tick - a.tick) / (b.tick - a.tick);
      return {
        fighters: a.fighters.map((fa, k) => lerpFighter(fa, b.fighters[k], t)),
        projectiles: lerpById(a.projectiles, b.projectiles, t),
        objects: lerpById(a.objects, b.objects, t),
        base: a,
      };
    }
    return null;
  }

  /**
   * Past the newest snapshot (a late clump): keep fighters moving along their last motion for a few
   * ticks rather than freezing them. Only when the last two snapshots are consecutive and nothing is
   * frozen (hitstop, ULTIMATE); the next real snapshot takes over through normal interpolation.
   */
  private extrapolate(a: StateMessage, tick: number): Sample | null {
    const n = this.snaps.length;
    const prev = n >= 2 ? this.snaps[n - 2] : null;
    const ahead = Math.min(tick - a.tick, SnapshotBuffer.MAX_EXTRAPOLATE);
    if (!prev || ahead <= 0 || a.hitstop > 0 || a.cinematic > 0 || a.phase !== 'FIGHTING') return null;
    const span = a.tick - prev.tick;
    if (span <= 0 || span > 3) return null;
    const k = ahead / span;
    return {
      fighters: a.fighters.map((fa, i) => {
        const fp = prev.fighters[i];
        if (!fp || Math.abs(fa.x - fp.x) > 120) return fa; // a teleport isn't motion
        return { ...fa, x: fa.x + (fa.x - fp.x) * k, y: Math.max(0, fa.y + (fa.y - fp.y) * k) };
      }),
      projectiles: a.projectiles, objects: a.objects, base: a,
    };
  }
}

export interface Sample {
  fighters: FighterView[];
  projectiles: ProjectileView[];
  objects: ObjectView[];
  /** Snapshot at or before the sampled time (discrete state: zones, phase, hitstop…). */
  base: StateMessage;
}

/** Interpolates entities that exist in both snapshots (matched by id); others are taken as-is. */
function lerpById<T extends { id: number; x: number; y: number }>(a: T[], b: T[], t: number): T[] {
  const next = new Map(b.map((e) => [e.id, e]));
  return a.map((ea) => {
    const eb = next.get(ea.id);
    if (!eb || Math.abs(ea.x - eb.x) > 300) return ea;
    return { ...ea, x: ea.x + (eb.x - ea.x) * t, y: ea.y + (eb.y - ea.y) * t };
  });
}

export function lerpFighter(a: FighterView, b: FighterView, t: number): FighterView {
  // Teleport-sized jumps (e.g. a reset) aren't smoothed.
  if (Math.abs(a.x - b.x) > 400) return t < 0.5 ? a : b;
  return {
    ...(t < 0.5 ? a : b), // discrete fields from the nearer snapshot
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vx: a.vx + (b.vx - a.vx) * t,
    vy: a.vy + (b.vy - a.vy) * t,
  };
}
