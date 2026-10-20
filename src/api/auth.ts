// "Continue with Google" through Supabase Auth with PKCE (no secret on the device). Same method as the main app.
//  Web:     the page goes to Google and comes back to the same address with ?code=…, exchanged here.
//  Android: Google opens in the phone's browser tab and returns to com.jslproperties.admineab://auth-callback?code=…
// Signing in with Google is NOT enough: after sign-in the app asks the database who this is (eab_admin_me); anyone
// not on the admin allow-list is signed out again straight away.
import { Conn, configured } from '../config';
import { isNative, openInBrowser, closeBrowser, AUTH_CALLBACK } from '../native/native';
import { ApiError, Session, TokenResponse, headers, toSession } from './session';

const PKCE_KEY = 'admin-eab-pkce';
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function newVerifier(): string {
  const a = new Uint8Array(48);
  crypto.getRandomValues(a);
  return b64url(a);
}
export async function challengeFor(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}
export function redirectUrl(): string {
  if (isNative()) return AUTH_CALLBACK;
  return `${window.location.origin}${window.location.pathname}`;
}
export function authorizeUrl(c: Conn, redirect: string, challenge: string): string {
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' });
  return `${c.supabaseUrl}/auth/v1/authorize?${q}`;
}
export const canSignInHere = () => isNative() || /^https?:$/.test(window.location.protocol);

const pk = {
  set: (v: string) => { try { localStorage.setItem(PKCE_KEY, v); } catch { /* blocked */ } },
  get: () => { try { return localStorage.getItem(PKCE_KEY); } catch { return null; } },
  clear: () => { try { localStorage.removeItem(PKCE_KEY); } catch { /* blocked */ } },
};

export async function startGoogleSignIn(c: Conn): Promise<void> {
  if (!configured(c)) throw new ApiError('not-configured');
  const v = newVerifier();
  pk.set(v);
  if (!(await openInBrowser(authorizeUrl(c, redirectUrl(), await challengeFor(v))))) throw new ApiError('network');
}

export type CallbackResult = { kind: 'none' } | { kind: 'error'; code: string } | { kind: 'signed-in'; session: Session };

export async function handleCallback(c: Conn, url: string, fetchFn: typeof fetch = fetch): Promise<CallbackResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'none' }; }
  const params = new URLSearchParams(u.search);
  if (u.hash.length > 1) for (const [k, v] of new URLSearchParams(u.hash.slice(1))) if (!params.has(k)) params.set(k, v);
  const code = params.get('code');
  const error = params.get('error') || params.get('error_code');
  if (!code && !error) return { kind: 'none' };
  await closeBrowser();
  if (error) { pk.clear(); return { kind: 'error', code: error }; }
  const verifier = pk.get();
  if (!verifier) return { kind: 'error', code: 'no-verifier' };
  try {
    const r = await fetchFn(`${c.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST', headers: headers(c), body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    pk.clear();
    if (!r.ok) return { kind: 'error', code: 'exchange' };
    return { kind: 'signed-in', session: toSession((await r.json()) as TokenResponse) };
  } catch {
    pk.clear();
    return { kind: 'error', code: 'network' };
  }
}

export function cleanWebAddress(): void {
  if (isNative()) return;
  try { window.history.replaceState(window.history.state, '', `${window.location.origin}${window.location.pathname}`); } catch { /* ignore */ }
}
