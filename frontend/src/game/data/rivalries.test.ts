import { describe, expect, it } from 'vitest';
import { RIVALRIES, rivalryFor } from './rivalries';
import { FIGHTERS } from './fighters';

describe('rivalries', () => {
  it('cover the four famous pairings, in either order', () => {
    expect(rivalryFor('tesla', 'edison')?.id).toBe('war-of-currents');
    expect(rivalryFor('edison', 'tesla')?.id).toBe('war-of-currents');
    expect(rivalryFor('hooke', 'newton')?.id).toBe('inverse-square');
    expect(rivalryFor('schrodinger', 'heisenberg')?.id).toBe('waves-vs-matrices');
    expect(rivalryFor('einstein', 'sn-bose')?.kind).toBe('DUO');
    expect(rivalryFor('newton', 'tesla')).toBeNull();
  });

  it('give both fighters an intro and a victory line', () => {
    for (const r of RIVALRIES) {
      for (const id of r.fighters) {
        expect(FIGHTERS[id], id).toBeDefined();
        expect(r.intro[id]?.length, `${r.id} intro ${id}`).toBeGreaterThan(10);
        expect(r.victory[id]?.length, `${r.id} victory ${id}`).toBeGreaterThan(5);
      }
      expect(r.fact.length).toBeGreaterThan(50);
    }
  });
});
