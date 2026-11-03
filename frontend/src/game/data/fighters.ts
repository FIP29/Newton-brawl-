import type { FighterDefinition } from '../protocol';
// Single source of truth: the same JSON the Java server loads.
import prototype from '../../../../backend/src/main/resources/fighters/prototype.json';
import newton from '../../../../backend/src/main/resources/fighters/newton.json';
import tesla from '../../../../backend/src/main/resources/fighters/tesla.json';
import curie from '../../../../backend/src/main/resources/fighters/curie.json';
import einstein from '../../../../backend/src/main/resources/fighters/einstein.json';
import galileo from '../../../../backend/src/main/resources/fighters/galileo.json';
import archimedes from '../../../../backend/src/main/resources/fighters/archimedes.json';
import faraday from '../../../../backend/src/main/resources/fighters/faraday.json';
import hooke from '../../../../backend/src/main/resources/fighters/hooke.json';
import schrodinger from '../../../../backend/src/main/resources/fighters/schrodinger.json';
import heisenberg from '../../../../backend/src/main/resources/fighters/heisenberg.json';
import hawking from '../../../../backend/src/main/resources/fighters/hawking.json';
import doppler from '../../../../backend/src/main/resources/fighters/doppler.json';
import bernoulli from '../../../../backend/src/main/resources/fighters/bernoulli.json';
import edison from '../../../../backend/src/main/resources/fighters/edison.json';
import snBose from '../../../../backend/src/main/resources/fighters/sn-bose.json';
import jcBose from '../../../../backend/src/main/resources/fighters/jc-bose.json';

export const FIGHTERS: Record<string, FighterDefinition> = {
  newton: newton as FighterDefinition,
  tesla: tesla as FighterDefinition,
  curie: curie as FighterDefinition,
  einstein: einstein as FighterDefinition,
  galileo: galileo as FighterDefinition,
  archimedes: archimedes as FighterDefinition,
  faraday: faraday as FighterDefinition,
  hooke: hooke as FighterDefinition,
  schrodinger: schrodinger as FighterDefinition,
  heisenberg: heisenberg as FighterDefinition,
  hawking: hawking as FighterDefinition,
  doppler: doppler as FighterDefinition,
  bernoulli: bernoulli as FighterDefinition,
  edison: edison as FighterDefinition,
  'sn-bose': snBose as FighterDefinition,
  'jc-bose': jcBose as FighterDefinition,
  prototype: prototype as FighterDefinition,
};

/** Starter fighters, always available (mirrors FighterCatalog.PLAYABLE). */
export const PLAYABLE = ['newton', 'tesla', 'curie', 'einstein'] as const;

/** Every implemented fighter in roster order (unlockable ones need an unlock). */
export const ROSTER = ['newton', 'tesla', 'curie', 'einstein', 'galileo', 'archimedes', 'faraday', 'hooke',
  'schrodinger', 'heisenberg', 'hawking', 'doppler', 'bernoulli', 'edison', 'sn-bose', 'jc-bose'] as const;

export function fighter(id: string): FighterDefinition {
  const def = FIGHTERS[id];
  if (!def) throw new Error(`Unknown fighter ${id}`);
  return def;
}
