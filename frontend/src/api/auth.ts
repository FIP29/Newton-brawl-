import { api } from './client';
import type { AuthResponse, PlayerProfile } from './types';

export const authApi = {
  register: (username: string, email: string, password: string) =>
    api<AuthResponse>('/api/auth/register', { method: 'POST', json: { username, email, password } }),

  /** `login` may be a username or an email address. */
  login: (login: string, password: string) =>
    api<AuthResponse>('/api/auth/login', { method: 'POST', json: { login, password } }),

  me: () => api<PlayerProfile>('/api/players/me'),
};
