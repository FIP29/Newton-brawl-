import { api } from './client';

export type MatchMode = 'CASUAL' | 'RANKED' | 'PRIVATE';
export type Tier = 'ATOM' | 'MOLECULE' | 'STAR' | 'SUPERNOVA' | 'BLACK_HOLE';

// ---------------------------------------------------------------- matchmaking
export interface TicketStatus {
  ticket: string; mode: MatchMode; state: 'SEARCHING' | 'MATCHED' | 'CANCELLED';
  roomCode: string | null; waitedSeconds: number; eloWindow: number; playersSearching: number;
}
export const matchmakingApi = {
  join: (mode: 'casual' | 'ranked') => api<TicketStatus>(`/api/matchmaking/${mode}`, { method: 'POST' }),
  poll: (ticket: string) => api<TicketStatus>(`/api/matchmaking/tickets/${ticket}`),
  cancel: (ticket: string) => api<void>(`/api/matchmaking/tickets/${ticket}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------- codex
export interface CodexMoveEntry { id: string; move: string; name: string; equation: string | null; law: string | null; explain: string | null; unlocked: boolean }
export interface CodexPage {
  id: string; name: string; lived: string; origin: string; phase: number; available: boolean; unlocked: boolean;
  bio: string | null; funFact: string | null; moves: CodexMoveEntry[];
}
export interface Codex { unlockedCount: number; totalCount: number; fighters: CodexPage[] }
export interface LabNote { fighterId: string; fighterName: string; move: string; moveName: string; equation: string | null; law: string; text: string }
export const codexApi = {
  get: () => api<Codex>('/api/codex'),
  labNote: (fighter: string, move: string) => api<LabNote>(`/api/codex/lab-note?fighter=${encodeURIComponent(fighter)}&move=${encodeURIComponent(move)}`),
};

// -------------------------------------------------------------------- unlocks
export interface UnlockStatus {
  id: string; type: 'FIGHTER' | 'SKIN'; fighter: string; skin: string | null; name: string;
  requirement: string; progress: number; target: number; unlocked: boolean; available: boolean;
}
export interface UnlockRef { id: string; name: string; type: 'FIGHTER' | 'SKIN'; fighter: string; skin: string | null; available: boolean }
export const unlocksApi = {
  list: () => api<UnlockStatus[]>('/api/unlocks'),
  usable: () => api<Record<string, string[]>>('/api/unlocks/usable'),
};

// ---------------------------------------------------------------- leaderboard
export interface LeaderboardEntry {
  rank: number; playerId: number; username: string; displayName: string; elo: number; tier: Tier; tierName: string;
  wins: number; losses: number; rankedGames: number;
}
export interface Leaderboard { page: number; size: number; totalPlayers: number; entries: LeaderboardEntry[]; me: LeaderboardEntry | null }
export const leaderboardApi = {
  get: (page = 0, size = 25) => api<Leaderboard>(`/api/leaderboard?page=${page}&size=${size}`),
};

// -------------------------------------------------------------------- history
export interface MatchHistoryEntry {
  id: number; mode: MatchMode; playedAt: string; fighter: string; opponentFighter: string; opponentId: number;
  opponentName: string; result: 'WIN' | 'LOSS' | 'DRAW'; rounds: number; opponentRounds: number;
  eloBefore: number; eloAfter: number; reason: string;
}
export interface FighterStats { fighter: string; matches: number; wins: number }
export const historyApi = {
  matches: (limit = 20) => api<MatchHistoryEntry[]>(`/api/players/me/matches?limit=${limit}`),
  fighters: () => api<FighterStats[]>('/api/players/me/fighters'),
};

// ------------------------------------------------------------------- rewards
export interface MatchReward {
  mode: MatchMode; eloBefore: number; eloAfter: number; tierBefore: Tier; tierAfter: Tier; tierNameAfter: string;
  newCodex: { id: string; title: string }[]; newUnlocks: UnlockRef[]; labNote: LabNote | null;
}

/** Elo thresholds, mirroring com.newtonbrawl.player.RankTier. */
export const TIERS: { id: Tier; name: string; min: number }[] = [
  { id: 'ATOM', name: 'Atom', min: 0 },
  { id: 'MOLECULE', name: 'Molecule', min: 1100 },
  { id: 'STAR', name: 'Star', min: 1300 },
  { id: 'SUPERNOVA', name: 'Supernova', min: 1500 },
  { id: 'BLACK_HOLE', name: 'Black Hole', min: 1700 },
];
export const tierFor = (elo: number) => [...TIERS].reverse().find((t) => elo >= t.min)!;
