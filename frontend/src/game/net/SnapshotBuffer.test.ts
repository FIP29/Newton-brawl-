import { describe, expect, it } from 'vitest';
import { TICK_MS, type StateMessage } from '../protocol';
import { SnapshotBuffer } from './SnapshotBuffer';

/** A minimal snapshot: one fighter walking right at 1 unit per tick. */
function snap(tick: number): StateMessage {
  return {
    t: 'state', tick, phase: 'FIGHTING', phaseTicks: 0, hitstop: 0, cinematic: 0, round: 1, roundWins: [0, 0],
    timer: 0, lastRound: null, projectiles: [], zones: [], objects: [], events: [], ack: [0, 0],
    fighters: [{ x: tick, y: 0, vx: 60, vy: 0 } as StateMessage['fighters'][number]],
  } as unknown as StateMessage;
}

/**
 * Plays `seconds` of a match: the server makes one snapshot per tick, `deliver` decides when each
 * arrives; the client renders at 60 fps. Returns how many frames had to hold or extrapolate (ran
 * past the newest snapshot) and the backwards jumps in rendered position.
 */
function play(deliver: (tick: number) => number, seconds: number) {
  const buf = new SnapshotBuffer();
  const arrivals = Array.from({ length: seconds * 60 }, (_, i) => ({ tick: i + 1, at: deliver(i + 1) }))
    .sort((a, b) => a.at - b.at);
  let next = 0, starved = 0, backwards = 0, lastX = -Infinity;
  for (let now = 0; now < seconds * 1000; now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= now) buf.push(snap(arrivals[next].tick), arrivals[next++].at);
    const tick = buf.renderTick(now);
    const s = buf.sample(tick);
    if (!s || now < 2000) continue; // let the clock settle first
    if (tick > buf.latest()!.tick) starved++;
    const x = s.fighters[0].x;
    if (x < lastX - 0.5) backwards++;
    lastX = x;
  }
  return { starved, backwards, delay: buf.delayTicks };
}

describe('SnapshotBuffer', () => {
  it('stays at the minimum delay on a clean connection', () => {
    const r = play((t) => t * TICK_MS + 40, 10);
    expect(r.starved).toBe(0);
    expect(r.delay).toBeCloseTo(SnapshotBuffer.MIN_DELAY, 0);
  });

  it('absorbs a bursty server (6 snapshots at once every 100 ms) without running dry', () => {
    // Like a CPU-throttled host: ticks are produced in clumps at the end of each 100 ms window.
    const r = play((t) => Math.ceil((t * TICK_MS) / 100) * 100 + 40, 12);
    expect(r.delay).toBeGreaterThan(5);
    expect(r.delay).toBeLessThanOrEqual(SnapshotBuffer.MAX_DELAY);
    expect(r.starved).toBeLessThan(10); // a few frames while it adapts, then none
    expect(r.backwards).toBe(0);
  });
});
