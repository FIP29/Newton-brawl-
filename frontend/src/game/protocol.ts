/**
 * Wire protocol for /ws/match. Mirrors backend:
 *   com.newtonbrawl.engine.input.InputBits
 *   com.newtonbrawl.match.protocol.ServerMessages
 *   com.newtonbrawl.engine.fighter.FighterDefinition
 */

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

export const Btn = {
  LEFT: 1,
  RIGHT: 1 << 1,
  UP: 1 << 2,
  DOWN: 1 << 3,
  LIGHT: 1 << 4,
  HEAVY: 1 << 5,
  SPECIAL: 1 << 6,
  /** Dedicated ULTIMATE button (HEAVY + SPECIAL together also works). */
  ULTIMATE: 1 << 7,
} as const;

export type MatchPhase = 'ROUND_START' | 'FIGHTING' | 'ROUND_END' | 'FINISHED';
export type Action = 'IDLE' | 'WALK' | 'CROUCH' | 'AIRBORNE' | 'ATTACK' | 'HITSTUN' | 'KO';

export interface Box { x: number; y: number; w: number; h: number }

export type MoveKind = 'NORMAL' | 'SPECIAL' | 'ULTIMATE';

export interface MoveDefinition {
  name?: string;
  kind?: MoveKind;
  /** The real law behind the move; flashed on screen when it lands. */
  equation?: string;
  startup: number; active: number; recovery: number;
  cooldown?: number;
  damage: number; hitstun: number; hitstop: number;
  /** Melee hitbox, or null/absent for moves that only spawn things. */
  hitbox?: Box | null;
  impulse?: { x: number; y: number };
  params?: Record<string, number>;
}

export interface FighterDefinition {
  id: string;
  name: string;
  title?: string;
  fighterClass: 'BRUISER' | 'SPEEDSTER' | 'ZONER' | 'TRICKSTER';
  color: string;
  mass: number;
  maxHealth: number;
  walkSpeed: number;
  jumpVelocity: number;
  airAcceleration: number;
  body: { width: number; height: number };
  moves: Record<string, MoveDefinition>;
}

export interface FighterView {
  x: number; y: number; vx: number; vy: number;
  facing: number;
  health: number;
  energy: number;
  action: Action;
  move: string | null;
  moveFrame: number;
  grounded: boolean;
  /** Hidden timers, sent so the client can reconstruct exact state for prediction. */
  stun: number;
  connected: boolean;
  buffered: number;
  bufferAge: number;
  /** Status effects / timers. */
  flip: number;
  reflect: number;
  invuln: number;
  cd1: number;
  cd2: number;
  timeAcc: number;
  objHits: number;
  buoy: number;
  cage: number;
  /** Ticks of swapped left/right controls left (Heisenberg). */
  scramble: number;
}

export interface ProjectileView {
  id: number; owner: number; kind: string; move: string;
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  damage: number; age: number; chains: number; reflected: boolean;
  /** Pendulum pivot (0 for other motions). */
  px: number; py: number;
}

export interface ZoneView {
  id: number; owner: number;
  kind: 'BUBBLE' | 'PULL' | 'TRAP' | 'BLAST' | 'BEAM' | 'FIELD' | 'LEVER' | 'FOCUS' | 'INDUCTION' | 'STORM' | 'SPRING'
    | 'GHOST' | 'CATBOX' | 'CLOUD' | 'WAVE' | 'BURST' | 'UNCERTAIN' | 'SINGULARITY' | 'BOOM';
  move: string;
  x: number; y: number; w: number; h: number;
  age: number; life: number; delay: number; active: number; armed: boolean;
}

export interface ObjectView { id: number; kind: string; x: number; y: number; vx: number; vy: number; w: number; h: number; owner: number }

export type GameEventType = 'HIT' | 'REFLECT' | 'ULTIMATE' | 'CAST' | 'ARC' | 'CLANK' | 'BLOCK' | 'SHATTER' | 'COLLAPSE' | 'SWALLOW';

/** Mirrors com.newtonbrawl.engine.sim.GameEvent. */
export interface GameEvent { type: GameEventType; attacker: number; defender: number; move: string | null; damage: number; x: number; y: number }

export interface PlayerInfo {
  slot: number; id: number; username: string; displayName: string; elo: number; connected: boolean;
  /** Picked fighter, or null while choosing. */
  fighter: string | null;
  skin: string;
}

export interface ObjectSpawn { kind: string; x: number; y: number; vx: number; vy: number; w: number; h: number; metal: boolean }

/** A black hole: props and projectiles accelerate toward it at GM / (r² + soft²); fighters drift toward it. */
export interface Well { x: number; y: number; gm: number; soft: number; core: number; drift: number }

/** Mirrors com.newtonbrawl.engine.sim.Arena. */
export interface ArenaInfo {
  id: string; name: string; width: number; height: number; gravity: number;
  objectGravity: number; bounce: number; wallBounce: number; objects: ObjectSpawn[];
  well?: Well | null;
}

export interface MatchRules { countdownTicks: number; roundTimeTicks: number; roundsToWin: number; maxRounds: number; roundEndTicks: number }

export interface RoundResult { round: number; winner: number; reason: 'KO' | 'DOUBLE_KO' | 'TIME' }

export type ServerMessage =
  | { t: 'welcome'; room: string; slot: number; mode: 'CASUAL' | 'RANKED' | 'PRIVATE'; players: PlayerInfo[];
      roster: FighterDefinition[]; usable: Record<string, string[]> }
  | { t: 'lobby'; players: PlayerInfo[] }
  | { t: 'start'; matchId: string; mode: 'CASUAL' | 'RANKED' | 'PRIVATE'; tickRate: number; rules: MatchRules; arena: ArenaInfo;
      players: PlayerInfo[]; fighters: FighterDefinition[] }
  | StateMessage
  | { t: 'end'; winner: number; reason: 'DECISION' | 'FORFEIT' | 'ABORTED'; ticks: number; roundWins: number[];
      reward: import('../api/progress').MatchReward | null }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'error'; code: string; message: string };

/** Mirrors com.newtonbrawl.engine.sim.MatchSnapshot. */
export interface Snapshot {
  tick: number;
  phase: MatchPhase;
  phaseTicks: number;
  hitstop: number;
  /** ULTIMATE cinematic freeze remaining. */
  cinematic: number;
  round: number;
  roundWins: number[];
  /** Round clock in ticks. */
  timer: number;
  lastRound: RoundResult | null;
  fighters: FighterView[];
  projectiles: ProjectileView[];
  zones: ZoneView[];
  objects: ObjectView[];
  events: GameEvent[];
}

export interface StateMessage extends Snapshot {
  t: 'state';
  ack: [number, number];
}

export type EndMessage = Extract<ServerMessage, { t: 'end' }>;
export type StartMessage = Extract<ServerMessage, { t: 'start' }>;
