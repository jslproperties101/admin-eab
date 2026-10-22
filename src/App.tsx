// Admin EAB: sign-in, then the signed-in app. Only admins on the database allow-list get past the sign-in:
// after Google, the app asks the database who this is; anyone else is signed out again at once.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Conn, configured, loadConn } from './config';
import { ApiError, Session, loadSession, rpc, saveSession, signOutRemote, vaultUpload, vaultDownload, mediaUpload, screenshotDownload, sendPush } from './api/session';
import { Me, api as makeApi } from './api/admin';
import { deviceLabel } from './native/native';
import { isIdle, lastUsed, watchIdle, markUsed } from './admin/idle';
import { Ctx, View, errText } from './ctx';
import { LoginScreen, LoginNotice } from './screens/Login';
import { Shell } from './screens/Shell';

type Phase = { k: 'checking' } | { k: 'login'; notice?: LoginNotice } | { k: 'in'; me: Me };

export default function App() {
  const [conn, setConn] = useState<Conn>(() => loadConn());
  const [phase, setPhase] = useState<Phase>({ k: 'checking' });
  const session = useRef<Session | null>(loadSession());
  const device = useMemo(() => deviceLabel(), []);

  const setSession = useCallback((s: Session | null) => { session.current = s; saveSession(s); }, []);

  const call = useCallback(async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const s = session.current;
    if (!s) throw new ApiError('expired');
    return rpc<T>(conn, s, fn, args, ns => setSession(ns));
  }, [conn, setSession]);
  const files = useMemo(() => ({
    upload: async (path: string, blob: Blob) => { const s = session.current; if (!s) throw new ApiError('expired'); await vaultUpload(conn, s, path, blob, ns => setSession(ns)); },
    download: async (path: string) => { const s = session.current; if (!s) throw new ApiError('expired'); return vaultDownload(conn, s, path, ns => setSession(ns)); },
    media: async (path: string, blob: Blob) => { const s = session.current; if (!s) throw new ApiError('expired'); return mediaUpload(conn, s, path, blob, ns => setSession(ns)); },
    screenshot: async (path: string) => { const s = session.current; if (!s) throw new ApiError('expired'); return screenshotDownload(conn, s, path, ns => setSession(ns)); },
    sendPush: async (itemId: string | null) => { const s = session.current; if (!s) throw new ApiError('expired'); return sendPush(conn, s, itemId, ns => setSession(ns)); },
  }), [conn, setSession]);
  const api = useMemo(() => makeApi(call, device, files), [call, device, files]);

  const signOut = useCallback((why: 'idle' | 'manual' | 'expired' | 'not-admin' = 'manual') => {
    const s = session.current;
    if (s) void signOutRemote(conn, s);
    setSession(null);
    setPhase({ k: 'login', notice: why === 'manual' ? undefined : why });
  }, [conn, setSession]);

  // On start: an existing session is checked (idle? still on the allow-list?) before anything is shown.
  useEffect(() => {
    if (phase.k !== 'checking') return;
    if (!configured(conn) || !session.current) { setPhase({ k: 'login' }); return; }
    if (isIdle(lastUsed(), Date.now())) { signOut('idle'); return; }
    api.me().then(me => {
      if (!me) { signOut('not-admin'); return; }
      markUsed();
      setPhase({ k: 'in', me });
    }).catch(e => {
      if (e instanceof ApiError && e.code === 'network') setPhase({ k: 'login', notice: 'network' });
      else signOut('expired');
    });
  }, [phase.k, conn, api, signOut]);

  /** Fresh Google sign-in: record it (also proves the allow-list) or refuse. */
  const onSignedIn = useCallback(async (s: Session) => {
    setSession(s);
    try {
      const me = await api.signedIn();
      markUsed();
      setPhase({ k: 'in', me });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not-allowed') signOut('not-admin');
      else { setSession(null); setPhase({ k: 'login', notice: { error: errText(e) } }); }
    }
  }, [api, setSession, signOut]);

  // 15 minutes without use → signed out (feature 79).
  useEffect(() => {
    if (phase.k !== 'in') return;
    return watchIdle(() => signOut('idle'));
  }, [phase.k, signOut]);

  // A regulator login ends by itself at its expiry time.
  useEffect(() => {
    if (phase.k !== 'in' || !phase.me.expires_at) return;
    const ms = new Date(phase.me.expires_at).getTime() - Date.now();
    if (ms <= 0) { signOut('expired'); return; }
    const t = window.setTimeout(() => signOut('expired'), Math.min(ms, 2_147_000_000));
    return () => window.clearTimeout(t);
  }, [phase, signOut]);

  if (phase.k === 'checking') return <div className="login"><p className="muted" role="status">Checking your sign-in…</p></div>;
  if (phase.k === 'login') return <LoginScreen conn={conn} onConn={setConn} notice={phase.notice} onSignedIn={onSignedIn} />;
  return <SignedIn conn={conn} me={phase.me} api={api} signOut={signOut} />;
}

function SignedIn({ conn, me, api, signOut }: { conn: Conn; me: Me; api: ReturnType<typeof makeApi>; signOut: (w?: 'idle' | 'manual' | 'expired') => void }) {
  const [stack, setStack] = useState<View[]>([{ k: 'home' }]);
  const view = stack[stack.length - 1];
  const go = useCallback((v: View) => { setStack(s => (v.k === 'home' ? [v] : [...s, v])); window.scrollTo?.(0, 0); }, []);
  const back = useCallback(() => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const value = useMemo(() => ({ conn, me, api, view, go, back, canBack: stack.length > 1, signOut }), [conn, me, api, view, go, back, stack.length, signOut]);
  return <Ctx.Provider value={value}><Shell /></Ctx.Provider>;
}
