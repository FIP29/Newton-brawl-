import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/parity.json';
import { MatchSimulation } from './MatchSimulation';
import { fighter } from '../data/fighters';
import type { ArenaInfo, MatchRules, Snapshot } from '../protocol';

interface FixtureMatch {
  arena: ArenaInfo; rules: MatchRules; fighters: [string, string];
  /** One int per tick: held0 | pressed0 << 8 | held1 << 16 | pressed1 << 24. */
  inputs: number[];
  checkpoints: Record<string, Snapshot>;
}

/**
 * The fixture is recorded by the Java engine (backend ParityFixtureTest): four matchups in The Lab
 * covering every special and ultimate. Replaying the same inputs through the TypeScript port must
 * reproduce every recorded snapshot exactly — this is what makes local play and client-side
 * prediction behave like the authoritative server.
 */
describe('TypeScript simulation matches the Java engine', () => {
  const matches = (fixture as unknown as { matches: FixtureMatch[] }).matches;

  for (const m of matches) {
    it(`${m.fighters[0]} vs ${m.fighters[1]}: every checkpoint bit-for-bit`, () => {
      const sim = new MatchSimulation(m.arena, [fighter(m.fighters[0]), fighter(m.fighters[1])], m.rules);
      let compared = 0;
      for (const packed of m.inputs) {
        sim.step({ held: packed & 0xff, pressed: (packed >>> 8) & 0xff },
                 { held: (packed >>> 16) & 0xff, pressed: (packed >>> 24) & 0xff });
        const expected = m.checkpoints[String(sim.tick)];
        if (expected) {
          expect(sim.snapshot(), `tick ${sim.tick}`).toEqual(expected);
          compared++;
        }
      }
      expect(compared).toBe(Object.keys(m.checkpoints).length);
    });
  }

  it('covers specials, ultimates, reflects, lightning arcs and multiple rounds', () => {
    const snaps = matches.flatMap((m) => Object.values(m.checkpoints));
    const types = new Set(snaps.flatMap((s) => s.events.map((e) => e.type)));
    for (const t of ['HIT', 'ULTIMATE', 'REFLECT', 'ARC'] as const) expect(types.has(t), t).toBe(true);
    expect(snaps.some((s) => s.projectiles.length > 0)).toBe(true);
    expect(snaps.some((s) => s.zones.length > 0)).toBe(true);
    expect(Math.max(...snaps.map((s) => s.round))).toBeGreaterThanOrEqual(2);
  });
});
