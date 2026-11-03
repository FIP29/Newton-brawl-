import type { FighterDefinition } from '../protocol';
// Single source of truth: the same JSON the Java server loads.
import prototype from '../../../../backend/src/main/resources/fighters/prototype.json';

export const FIGHTERS: Record<string, FighterDefinition> = {
  prototype: prototype as FighterDefinition,
};

export function fighter(id: string): FighterDefinition {
  const def = FIGHTERS[id];
  if (!def) throw new Error(`Unknown fighter ${id}`);
  return def;
}
