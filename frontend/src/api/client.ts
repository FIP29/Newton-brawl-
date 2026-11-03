/**
 * Thin fetch wrapper for the Spring Boot REST API.
 * - Attaches the JWT from the token store
 * - Parses the backend's uniform ApiError body into a typed exception
 * - Notifies listeners on 401 so the app can drop a stale session
 */

const TOKEN_KEY = 'nb.token';

export interface ApiErrorBody {
  status: number;
  error: string;
  message: string;
  path?: string;
  fieldErrors?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string,
              public readonly fieldErrors: Record<string, string> = {}) {
    super(message);
  }
}

/** Token storage. localStorage may throw (private mode / blocked storage), so guard every access. */
export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* session-only */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export function onUnauthorized(fn: UnauthorizedListener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

const BASE = import.meta.env.VITE_API_BASE ?? '';

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'Cannot reach the lab — is the server running?');
  }

  if (res.status === 401 && token) unauthorizedListeners.forEach((fn) => fn());

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.fieldErrors ?? {});
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
