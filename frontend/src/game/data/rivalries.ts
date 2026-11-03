// Single source of truth with the server: codex/rivalries.json.
import data from '../../../../backend/src/main/resources/codex/rivalries.json';

/** A famous rivalry (or partnership) between two scientists, with special intro and victory lines. */
export interface Rivalry {
  id: string;
  kind: 'RIVALRY' | 'DUO';
  fighters: [string, string];
  title: string;
  intro: Record<string, string>;
  victory: Record<string, string>;
  /** The real history behind it. */
  fact: string;
}

export const RIVALRIES = (data as unknown as { rivalries: Rivalry[] }).rivalries;

/** The rivalry between these two fighters, in either order, or null. */
export function rivalryFor(a: string, b: string): Rivalry | null {
  return RIVALRIES.find((r) => (r.fighters[0] === a && r.fighters[1] === b) || (r.fighters[0] === b && r.fighters[1] === a)) ?? null;
}
