import type { FighterDefinition } from '../protocol';
// Single source of truth: the same JSON the Java server loads.
import prototype from '../../../../backend/src/main/resources/fighters/prototype.json';
import newton from '../../../../backend/src/main/resources/fighters/newton.json';
import tesla from '../../../../backend/src/main/resources/fighters/tesla.json';
import curie from '../../../../backend/src/main/resources/fighters/curie.json';
import einstein from '../../../../backend/src/main/resources/fighters/einstein.json';

export const FIGHTERS: Record<string, FighterDefinition> = {
  newton: newton as FighterDefinition,
  tesla: tesla as FighterDefinition,
  curie: curie as FighterDefinition,
  einstein: einstein as FighterDefinition,
  prototype: prototype as FighterDefinition,
};

/** Selectable fighters in roster order (mirrors FighterCatalog.PLAYABLE). */
export const PLAYABLE = ['newton', 'tesla', 'curie', 'einstein'] as const;

export function fighter(id: string): FighterDefinition {
  const def = FIGHTERS[id];
  if (!def) throw new Error(`Unknown fighter ${id}`);
  return def;
}
