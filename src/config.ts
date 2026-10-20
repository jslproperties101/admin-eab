// Connection settings. Nothing secret is in the code: the build copies EAB_* environment variables into __EAB_CONFIG__,
// and the sign-in screen lets an admin type the URL and public key (kept on that device only). Typed values win.
export interface Conn { supabaseUrl: string; supabaseAnonKey: string }
declare const __EAB_CONFIG__: Conn | undefined;
declare const __EAB_BUILD__: { sha: string; version: string; release: string; builtAt: string } | undefined;

const built: Conn = (typeof __EAB_CONFIG__ !== 'undefined' && __EAB_CONFIG__) || { supabaseUrl: '', supabaseAnonKey: '' };
export const buildInfo = (typeof __EAB_BUILD__ !== 'undefined' && __EAB_BUILD__) || { sha: 'dev', version: '0.0.0', release: '', builtAt: '' };

const KEY = 'admin-eab-conn';
export function loadConn(): Conn {
  let typed: Partial<Conn> = {};
  try { typed = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage blocked */ }
  const url = (typed.supabaseUrl || built.supabaseUrl || '').trim().replace(/\/+$/, '');
  const key = (typed.supabaseAnonKey || built.supabaseAnonKey || '').trim();
  return { supabaseUrl: url, supabaseAnonKey: key };
}
export function saveConn(c: Conn | null): void {
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
export const configured = (c: Conn) => !!(c.supabaseUrl && c.supabaseAnonKey);
export const builtIn = () => !!(built.supabaseUrl && built.supabaseAnonKey);

export type ConnProblem = 'url' | 'pair' | 'secret' | null;
/** Checks a typed connection before saving it. Refuses a secret / service-role key outright. */
export function connProblem(url: string, key: string): ConnProblem {
  const u = url.trim(), k = key.trim();
  if (!u && !k) return null;
  if (!u || !k || /\s/.test(k)) return 'pair';
  if (isSecretKey(k)) return 'secret';
  let p: URL;
  try { p = new URL(u); } catch { return 'url'; }
  const local = p.hostname === 'localhost' || p.hostname === '127.0.0.1';
  if (p.protocol !== 'https:' && !(local && p.protocol === 'http:')) return 'url';
  if (p.pathname.replace(/\/+$/, '') !== '' || p.search || p.hash) return 'url';
  return null;
}
export function isSecretKey(k: string): boolean {
  if (/^sb_secret_/.test(k)) return true;
  const parts = k.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
      return json.role === 'service_role';
    } catch { return false; }
  }
  return false;
}
export const projectHost = (url: string) => { try { return new URL(url).host; } catch { return url.slice(0, 60); } };
