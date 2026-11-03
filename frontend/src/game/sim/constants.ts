/**
 * Mirrors com.newtonbrawl.engine.EngineConstants, sim.Arena and sim.MatchRules.STANDARD.
 * Any change here must also be made in Java (ParityFixtureTest / parity.test.ts catch drift).
 */
import type { ArenaInfo, MatchRules } from '../protocol';

export const TICK_RATE = 60;
export const DT = 1.0 / TICK_RATE;
export const GROUND_FRICTION = 0.82;

export const ENERGY_MAX = 1000;
export const ENERGY_PER_DAMAGE_DEALT = 1.0;
export const ENERGY_PER_DAMAGE_TAKEN = 0.6;

export const REAL_G = 980;
export const FLIP_GRAVITY = -0.35;
export const CINEMATIC_TICKS = 60;
export const OBJECT_MASS = 50;
export const OBJECT_DANGER_SPEED = 500;
export const SLOWMO_TICKS = 90;
export const OBJECT_INTERACT_HEIGHT = 140;

export const CROUCH_HEIGHT = 0.6;
export const INPUT_BUFFER_TICKS = 6;

export const THE_LAB: ArenaInfo = { id: 'the-lab', width: 1600, height: 900, gravity: 2600, objectSpawns: [250, 800, 1350] };

export const STANDARD_RULES: MatchRules = {
  countdownTicks: 120, roundTimeTicks: 99 * 60, roundsToWin: 2, maxRounds: 5, roundEndTicks: 150,
};
