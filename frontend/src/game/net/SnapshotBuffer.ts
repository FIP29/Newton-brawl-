import { TICK_MS, type FighterView, type StateMessage } from '../protocol';

/**
 * Buffers authoritative snapshots and samples them slightly in the past so motion is smooth
 * even when packets arrive unevenly (entity interpolation).
 *
 * We keep an estimate of the server's tick clock: `serverTick ≈ now / TICK_MS + offset`.
 * Rendering happens at `serverTick − delay`, interpolating between the two snapshots that
 * bracket that moment. Phase 3 adds client-side prediction for the local fighter on top.
 */
export class SnapshotBuffer {
  /** How far behind the newest estimate we render. ~50 ms absorbs typical jitter. */
  static readonly DELAY_TICKS = 3;
  private static readonly CAPACITY = 90;

  private readonly snaps: StateMessage[] = [];
  private offset: number | null = null;

  push(s: StateMessage, now: number) {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.tick <= last.tick) return; // stale / duplicate
    this.snaps.push(s);
    if (this.snaps.length > SnapshotBuffer.CAPACITY) this.snaps.shift();

    const target = s.tick - now / TICK_MS;
    if (this.offset === null || Math.abs(target - this.offset) > 30) {
      this.offset = target; // first packet or big discontinuity: snap
    } else if (target > this.offset) {
      this.offset += (target - this.offset) * 0.25; // arrived early: catch up quickly
    } else {
      this.offset += (target - this.offset) * 0.02; // arrived late: drift slowly
    }
  }

  latest(): StateMessage | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  /** Fractional tick to render at `now`. */
  renderTick(now: number): number {
    if (this.offset === null) return 0;
    return now / TICK_MS + this.offset - SnapshotBuffer.DELAY_TICKS;
  }

  /** Snapshots with tick in (afterTick, uptoTick], oldest first. Used to fire events in sync with visuals. */
  between(afterTick: number, uptoTick: number): StateMessage[] {
    return this.snaps.filter((s) => s.tick > afterTick && s.tick <= uptoTick);
  }

  /** Interpolated fighters at a fractional tick, plus the snapshot at or before it. */
  sample(tick: number): { fighters: FighterView[]; base: StateMessage } | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    if (tick <= this.snaps[0].tick) return { fighters: this.snaps[0].fighters, base: this.snaps[0] };
    for (let i = n - 1; i >= 0; i--) {
      const a = this.snaps[i];
      if (a.tick > tick) continue;
      const b = this.snaps[i + 1];
      if (!b) return { fighters: a.fighters, base: a }; // no newer data: hold (no extrapolation)
      const t = (tick - a.tick) / (b.tick - a.tick);
      return { fighters: a.fighters.map((fa, k) => lerpFighter(fa, b.fighters[k], t)), base: a };
    }
    return null;
  }
}

function lerpFighter(a: FighterView, b: FighterView, t: number): FighterView {
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
