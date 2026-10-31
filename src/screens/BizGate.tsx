// AdminBatch010: AI Buddy Biz screens open only after a separate Google sign-in to the Biz database, which checks its
// own admin list. The Admin EAB sign-in does not reach the Biz data.
import { ReactNode, useEffect, useState } from 'react';
import { useAdmin } from '../ctx';
import { configured, projectHost } from '../config';
import { onAppUrlOpen, isNative, BIZ_CALLBACK } from '../native/native';
import { cleanWebAddress, canSignInHere } from '../api/auth';
import { bizBuiltIn, bizSignOut, finishBizSignIn, isBizReturn, setBizConn, startBizSignIn, useBiz } from '../api/biz';

/** Handles the return from the Biz Google sign-in wherever the admin is (mounted once in the signed-in frame). */
export function useBizReturn(onDone: (r: 'ok' | 'not-admin' | 'error') => void) {
  const { device } = useAdmin();
  useEffect(() => {
    const run = async (url: string) => {
      const r = await finishBizSignIn(url, device);
      if (r === 'none') return;
      cleanWebAddress();
      onDone(r);
    };
    if (!isNative() && isBizReturn(window.location.href)) void run(window.location.href);
    let l: { remove: () => unknown } | null = null;
    void onAppUrlOpen(url => { if (url.startsWith(BIZ_CALLBACK)) void run(url); }).then(x => { l = x; });
    return () => { void l?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);
}

export function BizGate({ children }: { children: ReactNode }) {
  const biz = useBiz();
  if (biz.session && biz.me) {
    return (
      <div className="stack">
        <p className="small muted" data-testid="biz-signed-in">AI Buddy Biz: signed in as {biz.me.email} ({biz.me.role}) · {projectHost(biz.conn.supabaseUrl)}
          {' '}<button className="linkbtn" onClick={bizSignOut} data-testid="biz-sign-out">Sign out of Biz</button></p>
        {children}
      </div>
    );
  }
  return <BizConnect />;
}

const BIZ_NOTICE: Record<string, string> = {
  'not-admin': 'This Google account is not on the AI Buddy Biz admin list. The Biz Owner can add it in Biz Admins & Roles.',
  error: 'The Biz sign-in did not finish. Try again.',
};

export function BizConnect() {
  const biz = useBiz();
  const [url, setUrl] = useState(biz.conn.supabaseUrl);
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(() => { try { return sessionStorage.getItem('admin-biz-notice'); } catch { return null; } });
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { sessionStorage.removeItem('admin-biz-notice'); } catch { /* blocked */ } }, []);
  const ready = configured(biz.conn);
  return (
    <div className="card boxed stack" data-testid="biz-connect">
      <h1>Sign in to AI Buddy Biz</h1>
      <p className="muted">AI Buddy Biz has its own database and its own admin list. Sign in with the Google account that is on it.</p>
      {err && <div className="notice error" role="alert" data-testid="biz-notice">{BIZ_NOTICE[err] ?? err}</div>}
      {!bizBuiltIn() && (
        <details open={!ready} className="stack">
          <summary>Biz database connection {ready ? `(${projectHost(biz.conn.supabaseUrl)})` : '(not set)'}</summary>
          <label className="field"><span>Project URL</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" data-testid="biz-url" /></label>
          <label className="field"><span>Public (anon / publishable) key — never the secret key</span><input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJ… or sb_publishable_…" data-testid="biz-key" /></label>
          <button className="btn" data-testid="biz-save" onClick={() => {
            const p = setBizConn(url, key);
            setErr(p === 'secret' ? 'That is a SECRET / service-role key. Use the public key.' : p === 'url' ? 'The URL should look like https://xxxx.supabase.co' : p === 'pair' ? 'Type both the URL and the key.' : null);
            if (!p) setKey('');
          }}>Save connection</button>
        </details>
      )}
      <button className="btn gold" disabled={!ready || busy || !canSignInHere()} data-testid="biz-google" onClick={async () => {
        setErr(null); setBusy(true);
        try { await startBizSignIn(); } catch { setErr('Could not open Google sign-in. Check the connection and the internet.'); }
        finally { setBusy(false); }
      }}>Continue with Google</button>
    </div>
  );
}
