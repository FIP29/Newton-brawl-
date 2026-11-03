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
export const BUOY_GRAVITY = -0.12;
export const CINEMATIC_TICKS = 60;
export const OBJECT_MASS = 50;
export const OBJECT_DANGER_SPEED = 500;
export const SLOWMO_TICKS = 90;
export const OBJECT_INTERACT_HEIGHT = 140;

export const CROUCH_HEIGHT = 0.6;
export const INPUT_BUFFER_TICKS = 6;

export const THE_LAB: ArenaInfo = {
  id: 'the-lab', name: 'The Lab', width: 1600, height: 900, gravity: 2600, objectGravity: 1, bounce: 0.45, wallBounce: 0.6,
  objects: [250, 800, 1350].map((x) => ({ kind: 'beaker', x, y: 0, vx: 0, vy: 0, w: 36, h: 56, metal: true })),
};

/** Low gravity and drifting zero-g debris. */
export const SPACE_STATION: ArenaInfo = {
  id: 'space-station', name: 'Space Station', width: 1600, height: 900, gravity: 1100, objectGravity: 0, bounce: 0.85, wallBounce: 0.85,
  objects: [
    { kind: 'crate', x: 300, y: 420, vx: 30, vy: 12, w: 60, h: 60, metal: true },
    { kind: 'panel', x: 760, y: 610, vx: -24, vy: 16, w: 84, h: 30, metal: true },
    { kind: 'wrench', x: 1060, y: 300, vx: 20, vy: -14, w: 70, h: 24, metal: true },
    { kind: 'crate', x: 1330, y: 520, vx: -28, vy: -10, w: 60, h: 60, metal: true },
  ],
};

export const ARENAS: ArenaInfo[] = [THE_LAB, SPACE_STATION];

export const STANDARD_RULES: MatchRules = {
  countdownTicks: 120, roundTimeTicks: 99 * 60, roundsToWin: 2, maxRounds: 5, roundEndTicks: 150,
};
