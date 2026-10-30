// Sign-in screen: "Continue with Google", the reason for a sign-out (idle, not on the list…), and the connection
// settings (database address + PUBLIC key) for a build that has none built in.
import { adminName } from '../apps';
import { useEffect, useRef, useState } from 'react';
import { Conn, configured, connProblem, projectHost, saveConn, loadConn, builtIn } from '../config';
import { startGoogleSignIn, handleCallback, cleanWebAddress, canSignInHere } from '../api/auth';
import { Session } from '../api/session';
import { onAppUrlOpen, isNative, AUTH_CALLBACK } from '../native/native';
import { IDLE_MS } from '../admin/idle';
import logo from '../brand/logo-256.webp';

export type LoginNotice = 'idle' | 'expired' | 'not-admin' | 'network' | { error: string };

const NOTICE: Record<string, string> = {
  idle: `You were signed out after ${IDLE_MS / 60_000} minutes without use. Sign in again to continue.`,
  expired: 'Your sign-in has ended. Please sign in again.',
  'not-admin': `This Google account is not on the ${adminName()} list, or its access has ended. Ask the Owner to add it.`,
  network: 'No connection to the database. Check the internet and try again.',
};

export function LoginScreen({ conn, onConn, notice, onSignedIn }: {
  conn: Conn; onConn: (c: Conn) => void; notice?: LoginNotice; onSignedIn: (s: Session) => void;
}) {
  const [busy, setBusy] = useState<'idle' | 'opening' | 'exchanging'>(() =>
    typeof window !== 'undefined' && /[?&]code=/.test(window.location.search) ? 'exchanging' : 'idle');
  const [err, setErr] = useState<string | null>(null);
  const [showConn, setShowConn] = useState(!configured(conn));
  const done = useRef(onSignedIn);
  done.current = onSignedIn;

  useEffect(() => {
    const finish = async (url: string) => {
      setBusy('exchanging');
      const r = await handleCallback(conn, url);
      if (r.kind === 'none') { setBusy('idle'); return; }
      cleanWebAddress();
      if (r.kind === 'signed-in') done.current(r.session);
      else { setBusy('idle'); setErr(r.code === 'access_denied' ? 'Sign-in was cancelled.' : `Sign-in did not finish (${r.code}). Try again.`); }
    };
    if (!isNative() && /[?&#](code|error)=/.test(window.location.href)) void finish(window.location.href);
    let l: { remove: () => unknown } | null = null;
    void onAppUrlOpen(url => { if (url.startsWith(AUTH_CALLBACK)) void finish(url); }).then(x => { l = x; });
    return () => { void l?.remove(); };
  }, [conn]);

  async function go() {
    setErr(null); setBusy('opening');
    try { await startGoogleSignIn(conn); if (isNative()) setBusy('idle'); }
    catch { setBusy('idle'); setErr('Could not open Google sign-in. Check the connection settings and the internet.'); }
  }

  const noticeText = notice ? (typeof notice === 'string' ? NOTICE[notice] : notice.error) : null;
  return (
    <main className="login" data-testid="login">
      <section className="login-card stack">
        <img className="logo" src={logo} alt="" />
        <h1>{adminName()}</h1>
        <p className="muted">Compliance and administration for Estate Agent AI Buddy. Authorised staff only.</p>
        {noticeText && <div className={`notice ${notice === 'not-admin' ? 'error' : 'warn'}`} role="status" data-testid="login-notice">{noticeText}</div>}
        {!configured(conn) ? (
          <div className="notice warn" role="status" data-testid="login-not-set-up">The database connection is not set up yet. Open <b>Connection settings</b> below.</div>
        ) : !canSignInHere() ? (
          <div className="notice warn">Open {adminName()} from its web address or the Android app to sign in.</div>
        ) : (
          <button className="btn big google-btn" onClick={() => void go()} disabled={busy !== 'idle'} data-testid="google-sign-in">
            <GoogleG /> {busy === 'exchanging' ? 'Signing in…' : busy === 'opening' ? 'Opening Google…' : 'Continue with Google'}
          </button>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <p className="small muted">Every sign-in, search, view and export is recorded in a tamper-proof log.</p>
        <button className="linkbtn" onClick={() => setShowConn(v => !v)} aria-expanded={showConn}>Connection settings</button>
        {showConn && <ConnForm conn={conn} onSaved={c => { onConn(c); setShowConn(!configured(c)); }} />}
      </section>
    </main>
  );
}

function ConnForm({ conn, onSaved }: { conn: Conn; onSaved: (c: Conn) => void }) {
  const [url, setUrl] = useState(conn.supabaseUrl);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const problem = connProblem(url, key);
  const save = () => {
    if (problem === 'secret') { setMsg('That is a SECRET / service-role key. Never put it in an app. Use the public anon (publishable) key.'); return; }
    if (problem) { setMsg(problem === 'url' ? 'The address must look like https://xxxx.supabase.co' : 'Type both the address and the public key.'); return; }
    saveConn(url || key ? { supabaseUrl: url.trim(), supabaseAnonKey: key.trim() } : null);
    const c = loadConn();
    setMsg(configured(c) ? `Saved. Connected to ${projectHost(c.supabaseUrl)}.` : 'Cleared.');
    onSaved(c);
  };
  return (
    <div className="card stack" style={{ textAlign: 'left' }}>
      <small className="muted">Current: {configured(conn) ? projectHost(conn.supabaseUrl) : 'not set'}{builtIn() ? ' (built in)' : ''}. Kept on this device only.</small>
      <label className="field"><span>Database address</span><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" /></label>
      <label className="field"><span>Public (anon / publishable) key</span><input type="text" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJ… or sb_publishable_…" autoComplete="off" spellCheck={false} /></label>
      <div className="row">
        <button className="btn gold" onClick={save}>Save</button>
        <button className="btn ghost" onClick={() => { saveConn(null); const c = loadConn(); setUrl(c.supabaseUrl); setKey(''); setMsg('Back to the built-in connection.'); onSaved(c); }}>Use built-in</button>
      </div>
      {msg && <small role="status">{msg}</small>}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
