import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/parity.json';
import { MatchSimulation } from './MatchSimulation';
import { fighter } from '../data/fighters';
import type { ArenaInfo, MatchRules, Snapshot } from '../protocol';

/**
 * The fixture is recorded by the Java engine (backend ParityFixtureTest). Replaying the same
 * inputs through the TypeScript port must reproduce every recorded snapshot exactly — this is
 * what makes local play and client-side prediction behave like the authoritative server.
 */
describe('TypeScript simulation matches the Java engine', () => {
  const fx = fixture as unknown as {
    arena: ArenaInfo; rules: MatchRules; fighters: [string, string];
    inputs: number[][]; checkpoints: Record<string, Snapshot>;
  };

  it('reproduces every checkpoint bit-for-bit', () => {
    const sim = new MatchSimulation(fx.arena, [fighter(fx.fighters[0]), fighter(fx.fighters[1])], fx.rules);
    let compared = 0;
    for (const [h0, p0, h1, p1] of fx.inputs) {
      sim.step({ held: h0, pressed: p0 }, { held: h1, pressed: p1 });
      const expected = fx.checkpoints[String(sim.tick)];
      if (expected) {
        expect(sim.snapshot(), `tick ${sim.tick}`).toEqual(expected);
        compared++;
      }
    }
    expect(compared).toBe(Object.keys(fx.checkpoints).length);
  });

  it('covers hits, KOs, time-outs and multiple rounds', () => {
    const snaps = Object.values(fx.checkpoints);
    expect(snaps.some((s) => s.events.length > 0)).toBe(true);
    expect(snaps.some((s) => s.lastRound?.reason === 'KO')).toBe(true);
    expect(snaps.some((s) => s.lastRound?.reason === 'TIME')).toBe(true);
    expect(Math.max(...snaps.map((s) => s.round))).toBeGreaterThanOrEqual(2);
  });
});
