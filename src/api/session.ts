// The signed-in session (Supabase Auth tokens) and the calls to the database functions.
// Admin EAB only ever calls the eab_admin_* functions; each checks the admin's role on the server and logs the access.
import { Conn } from '../config';

export interface Session { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string }
export interface TokenResponse { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user?: { id: string; email?: string } }

export class ApiError extends Error {
  constructor(public code: 'network' | 'not-allowed' | 'expired' | 'not-found' | 'not-configured' | 'server', message?: string) {
    super(message || code);
  }
}

export function toSession(t: TokenResponse, now = Date.now()): Session {
  const exp = t.expires_at ? t.expires_at * 1000 : now + (t.expires_in ?? 3600) * 1000;
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp, userId: t.user?.id ?? '', email: t.user?.email ?? '' };
}

export const headers = (c: Conn, token?: string): Record<string, string> => ({
  apikey: c.supabaseAnonKey,
  Authorization: `Bearer ${token ?? c.supabaseAnonKey}`,
  'Content-Type': 'application/json',
});

const SKEY = 'admin-eab-session';
export function loadSession(): Session | null {
  try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return s && s.accessToken ? s : null; } catch { return null; }
}
export function saveSession(s: Session | null): void {
  try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch { /* storage blocked */ }
}

type FetchFn = typeof fetch;

export async function refresh(c: Conn, s: Session, fetchFn: FetchFn = fetch): Promise<Session> {
  let r: Response;
  try {
    r = await fetchFn(`${c.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(c), body: JSON.stringify({ refresh_token: s.refreshToken }) });
  } catch { throw new ApiError('network'); }
  if (!r.ok) throw new ApiError('expired');
  return toSession((await r.json()) as TokenResponse);
}

/** Maps a PostgREST error body to a plain error. 42501 = the server said "not allowed". */
export function errorFrom(status: number, body: { code?: string; message?: string } | null): ApiError {
  const code = body?.code ?? '';
  const msg = body?.message ?? '';
  if (code === '42501' || status === 403) return new ApiError('not-allowed', msg);
  if (code === 'P0002' || status === 404) return new ApiError('not-found', msg);
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303') return new ApiError('expired', msg);
  return new ApiError('server', msg || `HTTP ${status}`);
}

/**
 * Calls one database function. Refreshes the session once when it has expired; `onSession` receives the new tokens
 * (or null when the admin must sign in again).
 */
export async function rpc<T>(c: Conn, s: Session, fn: string, args: Record<string, unknown>,
  onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<T> {
  if (!/^eab_admin_[a-z_]+$/.test(fn)) throw new ApiError('server', 'unknown function');
  let session = s;
  if (session.expiresAt - Date.now() < 60_000) {
    try { session = await refresh(c, session, fetchFn); onSession(session); }
    catch (e) { if (e instanceof ApiError && e.code === 'expired') { onSession(null); } throw e; }
  }
  const call = () => fetchFn(`${c.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(c, session.accessToken), body: JSON.stringify(args) });
  let r: Response;
  try { r = await call(); } catch { throw new ApiError('network'); }
  if (r.status === 401) {
    try { session = await refresh(c, session, fetchFn); onSession(session); }
    catch (e) { onSession(null); throw e; }
    try { r = await call(); } catch { throw new ApiError('network'); }
  }
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!r.ok) throw errorFrom(r.status, body as { code?: string; message?: string } | null);
  return body as T;
}

export async function signOutRemote(c: Conn, s: Session, fetchFn: FetchFn = fetch): Promise<void> {
  try { await fetchFn(`${c.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(c, s.accessToken) }); } catch { /* offline */ }
}
