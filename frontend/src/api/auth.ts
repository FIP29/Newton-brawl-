import { api } from './client';
import type { AuthResponse, PlayerProfile } from './types';

export const authApi = {
  register: (username: string, email: string, password: string) =>
    api<AuthResponse>('/api/auth/register', { method: 'POST', json: { username, email, password } }),

  /** `login` may be a username or an email address. */
  login: (login: string, password: string) =>
    api<AuthResponse>('/api/auth/login', { method: 'POST', json: { login, password } }),

  /** One click, no form: a guest account with a generated name. */
  guest: () => api<AuthResponse>('/api/auth/guest', { method: 'POST' }),

  /** Turns the signed-in guest into a real account; the record, Codex and unlocks carry over. */
  claim: (username: string, email: string, password: string) =>
    api<AuthResponse>('/api/auth/claim', { method: 'POST', json: { username, email, password } }),

  me: () => api<PlayerProfile>('/api/players/me'),
};
