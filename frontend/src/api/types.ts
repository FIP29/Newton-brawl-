/** Mirrors com.newtonbrawl.player.dto.PlayerProfileDto */
export interface PlayerProfile {
  id: number;
  username: string;
  displayName: string;
  elo: number;
  rankTier: 'ATOM' | 'MOLECULE' | 'STAR' | 'SUPERNOVA' | 'BLACK_HOLE';
  rankTierName: string;
  wins: number;
  losses: number;
  winRate: number;
  createdAt: string;
}

/** Mirrors com.newtonbrawl.auth.dto.AuthResponse */
export interface AuthResponse {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  player: PlayerProfile;
}
