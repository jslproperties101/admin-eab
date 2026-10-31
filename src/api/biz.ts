// AdminBatch010: AI Buddy Biz has its own Supabase project, so the admin signs in to it separately with Google
// (same PKCE method, its own code verifier and session). The Biz database has its own admin allow-list
// (eab_admins / eab_admin_pending) and its own hash-chained log; nobody gets in just by having a Google account.
//  Web:     Google returns to this page with ?biz=1&code=…
//  Android: Google returns to <this admin's package>://biz-callback?code=…
// The connection comes from the build (EAB_BIZ_SUPABASE_URL / EAB_BIZ_SUPABASE_ANON_KEY) or is typed once on the
// Connect screen (kept on this device only). The public key only — a secret key is refused.
import { useSyncExternalStore } from 'react';
import { Conn, configured, connProblem } from '../config';
import { isNative, BIZ_CALLBACK } from '../native/native';
import { handleCallback, startGoogleSignIn } from './auth';
import { ApiError, Session, rpc, signOutRemote } from './session';
import { appCalls } from './apps';

declare const __EAB_BIZ__: Conn | undefined;
const built: Conn = (typeof __EAB_BIZ__ !== 'undefined' && __EAB_BIZ__) || { supabaseUrl: '', supabaseAnonKey: '' };

const CONN_KEY = 'admin-biz-conn';
const SESSION_KEY = 'admin-biz-session';
const PKCE_KEY = 'admin-biz-pkce';
const ME_KEY = 'admin-biz-me';

export interface BizMe { user_id: string; email: string; role: 'owner' | 'admin' | 'compliance' | 'viewer'; expires_at: string | null }
export interface BizState { conn: Conn; session: Session | null; me: BizMe | null }

const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null') as T; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };

function loadConn(): Conn {
  const t = read<Partial<Conn>>(CONN_KEY) ?? {};
  return { supabaseUrl: (t.supabaseUrl || built.supabaseUrl || '').trim().replace(/\/+$/, ''), supabaseAnonKey: (t.supabaseAnonKey || built.supabaseAnonKey || '').trim() };
}

let state: BizState = { conn: loadConn(), session: read<Session>(SESSION_KEY), me: read<BizMe>(ME_KEY) };
const subs = new Set<() => void>();
function set(next: Partial<BizState>) {
  state = { ...state, ...next };
  if ('session' in next) write(SESSION_KEY, state.session);
  if ('me' in next) write(ME_KEY, state.me);
  subs.forEach(f => f());
}
export const bizState = () => state;
export function useBiz(): BizState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
}
export const bizBuiltIn = () => configured(built);

/** Saves a typed Biz connection after checking it (a secret key is refused). Returns the problem, if any. */
export function setBizConn(url: string, key: string): ReturnType<typeof connProblem> {
  const p = connProblem(url, key);
  if (p) return p;
  write(CONN_KEY, { supabaseUrl: url.trim().replace(/\/+$/, ''), supabaseAnonKey: key.trim() });
  set({ conn: loadConn(), session: null, me: null });
  return null;
}

export const isBizReturn = (url: string) => {
  try { const u = new URL(url); return u.searchParams.get('biz') === '1' || url.startsWith(BIZ_CALLBACK); } catch { return false; }
};
const bizRedirect = () => (isNative() ? BIZ_CALLBACK : `${window.location.origin}${window.location.pathname}?biz=1`);

export async function startBizSignIn(): Promise<void> {
  await startGoogleSignIn(state.conn, { pkceKey: PKCE_KEY, redirect: bizRedirect() });
}

const call = <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const s = state.session;
  if (!s) return Promise.reject(new ApiError('expired'));
  return rpc<T>(state.conn, s, fn, args, ns => set(ns ? { session: ns } : { session: null, me: null }));
};

/** Finishes a Biz Google sign-in: exchange the code, then ask the Biz database whether this person is an admin. */
export async function finishBizSignIn(url: string, device: string, fetchFn: typeof fetch = fetch): Promise<'none' | 'ok' | 'not-admin' | 'error'> {
  if (!isBizReturn(url)) return 'none';
  const r = await handleCallback(state.conn, url, fetchFn, PKCE_KEY);
  if (r.kind === 'none') return 'none';
  if (r.kind === 'error') return 'error';
  set({ session: r.session, me: null });
  try {
    const me = await call<BizMe>('eab_admin_signed_in', { p_device: device });
    set({ me });
    return 'ok';
  } catch (e) {
    const s = state.session;
    if (s) void signOutRemote(state.conn, s);
    set({ session: null, me: null });
    return e instanceof ApiError && e.code === 'not-allowed' ? 'not-admin' : 'error';
  }
}

export function bizSignOut(): void {
  const s = state.session;
  if (s) void signOutRemote(state.conn, s);
  set({ session: null, me: null });
}

/** Calls to the Biz database (same names as Admin EAB's). */
export const bizApi = (device: string) => appCalls(call, device);
