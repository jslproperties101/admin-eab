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

// ---------- Storage (AdminBatch003: Document Vault, bucket 'eab-vault') ----------
// The database decides what may be uploaded or read (storage rules eab_vault_can_upload / eab_vault_can_read):
// only the file of a pack registered by this admin, at <pack id>/<sha256>, once; no overwrite, no delete.
export const VAULT_BUCKET = 'eab-vault';
const objectUrl = (c: Conn, path: string, read = false) =>
  `${c.supabaseUrl}/storage/v1/object/${read ? 'authenticated/' : ''}${VAULT_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

async function withSession(c: Conn, s: Session, onSession: (s: Session | null) => void, fetchFn: FetchFn,
  go: (token: string) => Promise<Response>): Promise<Response> {
  let session = s;
  if (session.expiresAt - Date.now() < 60_000) {
    try { session = await refresh(c, session, fetchFn); onSession(session); }
    catch (e) { if (e instanceof ApiError && e.code === 'expired') onSession(null); throw e; }
  }
  let r: Response;
  try { r = await go(session.accessToken); } catch { throw new ApiError('network'); }
  if (r.status === 401) {
    try { session = await refresh(c, session, fetchFn); onSession(session); } catch (e) { onSession(null); throw e; }
    try { r = await go(session.accessToken); } catch { throw new ApiError('network'); }
  }
  return r;
}

export async function vaultUpload(c: Conn, s: Session, path: string, blob: Blob, onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<void> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(path)) throw new ApiError('server', 'bad vault path');
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(objectUrl(c, path), {
    method: 'POST',
    headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'no-store' },
    body: blob,
  }));
  if (!r.ok) {
    let msg = '';
    try { msg = ((await r.json()) as { message?: string }).message ?? ''; } catch { /* no body */ }
    throw r.status === 403 || /row-level security|Unauthorized/i.test(msg) ? new ApiError('not-allowed', msg) : new ApiError('server', msg || `upload HTTP ${r.status}`);
  }
}

export async function vaultDownload(c: Conn, s: Session, path: string, onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<Blob> {
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(objectUrl(c, path, true), {
    headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}` },
  }));
  if (r.status === 400 || r.status === 404) throw new ApiError('not-found', 'file not in the vault');
  if (r.status === 403) throw new ApiError('not-allowed');
  if (!r.ok) throw new ApiError('server', `download HTTP ${r.status}`);
  return r.blob();
}

/** Hex sha256 of a file — the fingerprint recorded in the vault. */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data instanceof Uint8Array ? data.slice().buffer : data;
  const d = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- AdminBatch006: post files, ticket screenshots, sending push alerts ----------
// Post pictures and PDFs go in the PUBLIC folder 'eab-feed-media' at <year>/<random id>.<ext> (storage rule
// eab_feed_media_can_upload: Owner / Admin only, no overwrite, no delete); the main app opens them by their public link.
export const MEDIA_BUCKET = 'eab-feed-media';
export const MEDIA_PATH = /^[0-9]{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;
export const mediaPublicUrl = (c: Conn, path: string) => `${c.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;

export async function mediaUpload(c: Conn, s: Session, path: string, blob: Blob, onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<string> {
  if (!MEDIA_PATH.test(path)) throw new ApiError('server', 'bad file name');
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(`${c.supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' },
    body: blob,
  }));
  if (!r.ok) {
    let msg = '';
    try { msg = ((await r.json()) as { message?: string }).message ?? ''; } catch { /* no body */ }
    if (r.status === 413 || /size/i.test(msg)) throw new ApiError('server', 'the file is larger than 10 MB');
    if (/mime|type/i.test(msg)) throw new ApiError('server', 'only JPG, PNG, WEBP pictures and PDF files');
    throw r.status === 403 || /row-level security|Unauthorized/i.test(msg) ? new ApiError('not-allowed', msg) : new ApiError('server', msg || `upload HTTP ${r.status}`);
  }
  return mediaPublicUrl(c, path);
}

/** A problem report's screenshot (private folder 'bug-reports'; storage rule eab_ticket_can_read). */
export async function screenshotDownload(c: Conn, s: Session, path: string, onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<Blob> {
  const url = `${c.supabaseUrl}/storage/v1/object/authenticated/bug-reports/${path.split('/').map(encodeURIComponent).join('/')}`;
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(url, { headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}` } }));
  if (r.status === 400 || r.status === 404) throw new ApiError('not-found', 'screenshot not found');
  if (r.status === 403) throw new ApiError('not-allowed');
  if (!r.ok) throw new ApiError('server', `download HTTP ${r.status}`);
  return r.blob();
}

export interface PushSendItem { item_id: string; targeted?: number; sent?: number; failed?: number; no_phone?: number; skipped?: string }
/**
 * Sends waiting push alerts through the main app's server function send-push (JoyChange010-03). The function checks
 * the role (Owner / Admin) and writes "push_broadcast_started" to the Master Audit Log. 503 = Firebase not set up.
 */
export async function sendPush(c: Conn, s: Session, itemId: string | null, onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<PushSendItem[]> {
  const body = itemId ? { kind: 'feed', item_id: itemId } : { kind: 'feed' };
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(`${c.supabaseUrl}/functions/v1/send-push`, {
    method: 'POST', headers: headers(c, token), body: JSON.stringify(body),
  }));
  let data: { items?: PushSendItem[]; item_id?: string; skipped?: string; error?: string; message?: string } | null = null;
  try { data = await r.json(); } catch { data = null; }
  if (r.status === 403) throw new ApiError('not-allowed', data?.error ?? data?.message);
  if (r.status === 503) throw new ApiError('server', 'push is not set up on the server yet (Firebase)');
  if (!r.ok) throw new ApiError('server', data?.error ?? data?.message ?? `send HTTP ${r.status}`);
  if (data?.items) return data.items;
  if (data?.item_id) return [{ item_id: data.item_id, skipped: data.skipped }];
  return [];
}

// ---------- AdminBatch008: broadcasts and the weekly report (Edge Functions in the main repo) ----------
export interface BroadcastSendResult { broadcast_id: string; sent: number; failed: number; status: string; more: boolean }
/**
 * Calls one of the AdminBatch008 server functions with the admin's own sign-in. The function asks the database, with
 * that sign-in, whether this admin may do it (eab_admin_broadcast_claim / eab_admin_report_claim). 503 = not set up yet.
 */
export async function callFunction<T>(c: Conn, s: Session, name: 'send-broadcast' | 'weekly-report', body: unknown,
  onSession: (s: Session | null) => void, fetchFn: FetchFn = fetch): Promise<T> {
  const r = await withSession(c, s, onSession, fetchFn, token => fetchFn(`${c.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST', headers: headers(c, token), body: JSON.stringify(body),
  }));
  let data: (T & { error?: string; message?: string }) | null = null;
  try { data = await r.json(); } catch { data = null; }
  if (r.status === 403) throw new ApiError('not-allowed', data?.error ?? data?.message);
  if (r.status === 404 && !data) throw new ApiError('server', `the server function "${name}" is not deployed yet`);
  if (r.status === 503) throw new ApiError('server', data?.error === 'email not set up'
    ? 'Email is not set up on the server yet (Resend key missing).'
    : data?.error ?? 'not set up on the server yet');
  if (!r.ok) throw new ApiError('server', data?.error ?? data?.message ?? `HTTP ${r.status}`);
  return data as T;
}
