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
} as const;

export type MatchPhase = 'COUNTDOWN' | 'FIGHTING' | 'KO' | 'FINISHED';
export type Action = 'IDLE' | 'WALK' | 'CROUCH' | 'AIRBORNE' | 'ATTACK' | 'HITSTUN' | 'KO';

export interface Box { x: number; y: number; w: number; h: number }

export interface MoveDefinition {
  startup: number; active: number; recovery: number;
  damage: number; hitstun: number; hitstop: number;
  hitbox: Box;
  impulse: { x: number; y: number };
}

export interface FighterDefinition {
  id: string;
  name: string;
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
  facing: 1 | -1;
  health: number;
  action: Action;
  move: string | null;
  moveFrame: number;
  grounded: boolean;
}

export interface HitEvent { attacker: number; defender: number; move: string; damage: number; x: number; y: number }

export interface PlayerInfo { slot: number; id: number; username: string; displayName: string; elo: number; connected: boolean }

export interface ArenaInfo { id: string; width: number; gravity: number }

export type ServerMessage =
  | { t: 'welcome'; room: string; slot: number; players: PlayerInfo[] }
  | { t: 'lobby'; players: PlayerInfo[] }
  | { t: 'start'; matchId: string; tickRate: number; countdownTicks: number; arena: ArenaInfo;
      players: PlayerInfo[]; fighters: FighterDefinition[] }
  | StateMessage
  | { t: 'end'; winner: number; reason: 'KO' | 'DOUBLE_KO' | 'FORFEIT' | 'ABORTED'; ticks: number }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'error'; code: string; message: string };

export interface StateMessage {
  t: 'state';
  tick: number;
  phase: MatchPhase;
  phaseTicks: number;
  hitstop: number;
  fighters: [FighterView, FighterView];
  events: HitEvent[];
  ack: [number, number];
}

export type EndMessage = Extract<ServerMessage, { t: 'end' }>;
export type StartMessage = Extract<ServerMessage, { t: 'start' }>;
