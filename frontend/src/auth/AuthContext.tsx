import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { ApiError, onUnauthorized, tokenStore, wakeServer } from '../api/client';
import type { AuthResponse, PlayerProfile } from '../api/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  player: PlayerProfile | null;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  /** Sign in as a brand-new guest. */
  playAsGuest: () => Promise<void>;
  /** Give the current guest a username, email and password (keeps their progress). */
  claim: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch the profile (e.g. after a match changed the win/loss record). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Holds the current session. On boot, a stored token is validated by calling /players/me. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [player, setPlayer] = useState<PlayerProfile | null>(null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setPlayer(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => onUnauthorized(logout), [logout]);

  useEffect(() => {
    if (status !== 'loading') return;
    // Only a 401 means the token is bad. A sleeping/booting server (network error, 502/503) must not throw
    // the session away (for a guest that would lose the account), so wait for it to wake and try again.
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const p = await authApi.me();
          if (!cancelled) { setPlayer(p); setStatus('authenticated'); }
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) { logout(); return; }
          await wakeServer();
        }
      }
      if (!cancelled) setStatus('anonymous'); // keep the token: a reload later can still restore the session
    })();
    return () => { cancelled = true; };
    // run once on boot only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = useCallback((res: AuthResponse) => {
    tokenStore.set(res.token);
    setPlayer(res.player);
    setStatus('authenticated');
  }, []);

  // Stable identity so effects can depend on it without re-running on every profile change.
  const refresh = useCallback(async () => {
    try { setPlayer(await authApi.me()); } catch { /* 401 is handled globally */ }
  }, []);

  const value = useMemo<AuthState>(() => ({
    status,
    player,
    logout,
    login: async (l, p) => accept(await authApi.login(l, p)),
    register: async (u, e, p) => accept(await authApi.register(u, e, p)),
    playAsGuest: async () => accept(await authApi.guest()),
    claim: async (u, e, p) => accept(await authApi.claim(u, e, p)),
    refresh,
  }), [status, player, logout, accept, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
