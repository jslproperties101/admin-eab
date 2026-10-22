// Agent Profile Viewer (feature 14) — the core compliance screen. Shows who the agent is and EVERY record they hold,
// including soft-deleted ones (feature 49), with each record's full version history (feature 48). Owner and
// Compliance can export it all to PDF and Excel with a reference number (features 19 later stores them).
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AccountStatus, AgentProfile, AgentRecord, LoginRow, TermsRow, Version } from '../api/admin';
import { can } from '../admin/roles';
import { fmtTime, historyLines, labelOf, recordFields, recordTitle, sortCollections } from '../export/reports';
import { exportAgentProfile } from '../export/run';
import { ConfirmDialog, ErrorBox, Kv, Loading } from './ui';
import { EVENT_LABEL, LicenceTag, STATUS_LABEL, StatusTag, isBadEvent, platformLabel } from './status';
import { InternalBox } from './Compliance';

// Special tabs next to the record types (AdminBatch002).
const LOGIN_TAB = '__login', TERMS_TAB = '__terms';

export function AgentScreen({ id, openCollection, openRecord }: { id: string; openCollection?: string; openRecord?: string }) {
  const { api, me, go } = useAdmin();
  const [p, setP] = useState<AgentProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [coll, setColl] = useState<string | null>(openCollection ?? null);
  const [showDeleted, setShowDeleted] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const prof = await api.agent(id);
      setP(prof);
      setColl(c => c ?? sortCollections(Object.keys(prof.counts))[0] ?? null);
    } catch (e) { setErr(errText(e)); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!p) return <Loading text="Loading agent…" />;
  const collections = sortCollections(Object.keys(p.counts));
  return (
    <div className="split">
      <aside className="side stack">
        <div className="card boxed stack">
          <div className="row"><h1 style={{ fontSize: '1.25rem' }}>{p.name || p.email}</h1><StatusTag status={p.status} /></div>
          {p.status !== 'active' && p.status_reason && <div className="notice error small" data-testid="status-reason">Reason: {p.status_reason}</div>}
          <Kv rows={[
            { k: 'Email', v: p.email },
            { k: 'User ID', v: <span className="mono">{p.user_id}</span> },
            { k: 'Licence', v: p.licence ? <>{p.licence} {p.licence_detail && <LicenceTag licence={p.licence_detail} />}</> : <span className="muted">Not provided</span> },
            { k: 'Terms', v: p.terms ? `Version ${p.terms.version ?? '?'} accepted ${fmtTime(p.terms.at)}` : <span className="muted">Not accepted yet</span> },
            { k: 'News & offers', v: p.marketing == null ? <span className="muted">Not answered</span> : p.marketing ? 'Yes' : 'No' },
            { k: 'Joined', v: fmtTime(p.joined_at) },
            { k: 'Last sign-in', v: p.last_login ? `${fmtTime(p.last_login.at)}${p.last_login.platform ? ` · ${platformLabel(p.last_login.platform)}` : ''}${p.last_login.app_version ? ` · v${p.last_login.app_version}` : ''}` : fmtTime(p.last_sign_in_at) },
            ...(p.force_logout_after ? [{ k: 'Forced sign-out', v: `Phones signed in before ${fmtTime(p.force_logout_after)} are signed out` }] : []),
            { k: 'Workspaces', v: p.workspaces.map(w => `${w.name} (${w.role})`).join(', ') },
          ]} />
        </div>
        {can(me.role, 'internal') && <InternalBox userId={p.user_id} email={p.email} />}
        {can(me.role, 'accountActions') && <AccountBox profile={p} onChanged={() => void load()} />}
        {can(me.role, 'verifyLicence') && p.licence_detail && <LicenceBox profile={p} onChanged={() => void load()} />}
        {can(me.role, 'export') && <ExportBox profile={p} />}
        {can(me.role, 'viewLogs') && (
          <button className="btn" onClick={() => go({ k: 'logs', tab: 'access', target: p.user_id })}>Who viewed this agent</button>
        )}
      </aside>
      <section className="stack">
        <div className="tabs" role="toolbar" aria-label="Record types">
          {collections.length === 0 && <span className="muted">This agent has no records.</span>}
          {collections.map(c => (
            <button key={c} aria-pressed={coll === c} onClick={() => setColl(c)} data-testid={`tab-${c}`}>
              {labelOf(c)} {p.counts[c].total}{p.counts[c].deleted ? ` · ${p.counts[c].deleted} deleted` : ''}
            </button>
          ))}
          <button aria-pressed={coll === LOGIN_TAB} onClick={() => setColl(LOGIN_TAB)} data-testid="tab-login">Sign-in history</button>
          <button aria-pressed={coll === TERMS_TAB} onClick={() => setColl(TERMS_TAB)} data-testid="tab-terms">Terms & consent</button>
        </div>
        {coll === LOGIN_TAB && <LoginHistory agent={p.user_id} />}
        {coll === TERMS_TAB && <TermsHistory agent={p.user_id} />}
        {coll && coll !== LOGIN_TAB && coll !== TERMS_TAB && (
          <>
            <label className="row small"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted records</label>
            <RecordList key={coll} agent={p.user_id} collection={coll} includeDeleted={showDeleted} openRecord={coll === openCollection ? openRecord : undefined} />
          </>
        )}
      </section>
    </div>
  );
}

function RecordList({ agent, collection, includeDeleted, openRecord }: { agent: string; collection: string; includeDeleted: boolean; openRecord?: string }) {
  const { api } = useAdmin();
  const [rows, setRows] = useState<AgentRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(openRecord ?? null);
  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api.records(agent, collection, includeDeleted, 500)); } catch (e) { setErr(errText(e)); }
  }, [api, agent, collection, includeDeleted]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="muted">No {labelOf(collection).toLowerCase()}.</p>;
  return (
    <div className="list" data-testid="record-list">
      {rows.map(r => {
        const isOpen = open === r.id;
        const fields = recordFields(r);
        return (
          <div key={r.id} className={`item ${r.deleted ? 'deleted' : ''}`}>
            <button className="row" style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', minHeight: 44 }}
              onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} data-testid="record">
              <b className="spacer">{recordTitle(r)}</b>
              {r.deleted && <span className="tag red">Deleted — kept for audit</span>}
              <span className="tag">v{r.rev}</span>
              <small className="muted">{fmtTime(r.written_at)}</small>
            </button>
            {!isOpen && <small className="muted">{fields.slice(0, 4).map(f => `${f.k}: ${f.v}`).join(' · ')}</small>}
            {isOpen && (
              <div className="stack" style={{ marginTop: 10 }}>
                <Kv rows={[{ k: 'Record ID', v: <span className="mono">{r.id}</span> }, ...fields]} />
                <History ws={r.workspace_id} collection={collection} id={r.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function History({ ws, collection, id }: { ws: string; collection: string; id: string }) {
  const { api } = useAdmin();
  const [v, setV] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const load = async () => {
    setShown(true); setErr(null);
    try { setV(await api.history(ws, collection, id)); } catch (e) { setErr(errText(e)); }
  };
  if (!shown) return <button className="btn small" onClick={() => void load()} data-testid="show-history">Show change history</button>;
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!v) return <Loading text="Loading history…" />;
  const lines = historyLines(v);
  return (
    <div className="card stack" data-testid="history">
      <h3>Change history · {v.length} version{v.length === 1 ? '' : 's'}</h3>
      {lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>Never changed since it was first saved.</p>
        : <ol className="history small">{[...lines].reverse().map((l, i) => <li key={i}>{l}</li>)}</ol>}
    </div>
  );
}

function ExportBox({ profile }: { profile: AgentProfile }) {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [withHistory, setWithHistory] = useState(true);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try {
      const r = await exportAgentProfile(api, me.email, profile, format, { withHistory });
      setMsg({ ok: true, text: `${r.reference}: ${r.how}` });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    finally { setBusy(null); }
  };
  return (
    <div className="card stack">
      <h3>Export for regulator / police</h3>
      <small className="muted">Every record of this agent, including deleted ones. Each export gets a reference number and is recorded in the access log.</small>
      <label className="row small"><input type="checkbox" checked={withHistory} onChange={e => setWithHistory(e.target.checked)} /> Include change history</label>
      <div className="row">
        <button className="btn gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="export-pdf">{busy === 'pdf' ? 'Making PDF…' : 'PDF'}</button>
        <button className="btn gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="export-xlsx">{busy === 'xlsx' ? 'Making Excel…' : 'Excel'}</button>
      </div>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="export-msg">{msg.text}</small>}
    </div>
  );
}

// ---------- AdminBatch002: account status, licence, sign-in history, Terms ----------

type StatusAction = { kind: 'status'; status: AccountStatus; force: boolean } | { kind: 'logout' };

/** Suspend / ban / close / re-activate and force logout (features 46, 47). Owner and Admin only; reason + confirm. */
function AccountBox({ profile, onChanged }: { profile: AgentProfile; onChanged: () => void }) {
  const { api } = useAdmin();
  const [act, setAct] = useState<StatusAction | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const st = profile.status;
  const closedByGoogle = !!profile.deleted_at;
  const options: { s: AccountStatus; label: string; danger: boolean; help: string }[] = [
    { s: 'suspended', label: 'Suspend', danger: true, help: 'Temporarily stops the agent using the app. Their records are kept.' },
    { s: 'banned', label: 'Ban', danger: true, help: 'Permanently stops the agent using the app. Their records are kept.' },
    { s: 'closed', label: 'Close account', danger: true, help: 'For an agent who left or asked to close. Records are kept for 7 years.' },
  ];
  const title = act?.kind === 'logout' ? 'Force sign-out' : act ? (act.status === 'active' ? 'Re-activate account' : `${STATUS_LABEL[act.status]} account`) : '';
  return (
    <div className="card stack" data-testid="account-box">
      <h3>Account</h3>
      <small className="muted">The agent sees a message with the support contact the next time the app opens or syncs. Their records are never deleted.</small>
      {closedByGoogle ? <p className="notice warn small" style={{ margin: 0 }}>This Google account was deleted. Nothing to change here.</p> : (
        <div className="row">
          {st !== 'active' && <button className="btn gold" onClick={() => setAct({ kind: 'status', status: 'active', force: false })} data-testid="act-reactivate">Re-activate</button>}
          {options.filter(o => o.s !== st).map(o => (
            <button key={o.s} className="btn small" onClick={() => setAct({ kind: 'status', status: o.s, force: true })} data-testid={`act-${o.s}`} title={o.help}>{o.label}</button>
          ))}
          {st === 'active' && <button className="btn small" onClick={() => setAct({ kind: 'logout' })} data-testid="act-logout">Force sign-out</button>}
        </div>
      )}
      {done && <small role="status" className="gold">{done}</small>}
      {act && (
        <ConfirmDialog
          title={title}
          danger={act.kind === 'logout' || act.status !== 'active'}
          body={<p>{profile.name || profile.email} ({profile.email}): {act.kind === 'logout'
            ? 'every phone signed in now is signed out at its next app open or sync. The agent can sign in again.'
            : act.status === 'active' ? 'the account becomes active again; the agent can sign in.'
            : `${options.find(o => o.s === act.status)?.help} The agent is signed out on every phone.`}</p>}
          confirmLabel={act.kind === 'logout' ? 'Force sign-out' : act.status === 'active' ? 'Re-activate' : STATUS_LABEL[act.status]}
          onClose={() => setAct(null)}
          onConfirm={async reason => {
            try {
              if (act.kind === 'logout') await api.forceLogout(profile.user_id, reason);
              else await api.setStatus(profile.user_id, act.status, reason, act.force);
            } catch (e) { throw new Error(errText(e)); }
            setDone(act.kind === 'logout' ? 'Sign-out sent.' : `Account is now ${STATUS_LABEL[act.status].toLowerCase()}.`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Licence verification (feature 52): the number is checked by hand on the board's website, then ticked here. */
function LicenceBox({ profile, onChanged }: { profile: AgentProfile; onChanged: () => void }) {
  const { api } = useAdmin();
  const [ask, setAsk] = useState<boolean | null>(null);
  const l = profile.licence_detail!;
  return (
    <div className="card stack" data-testid="licence-box">
      <h3>Licence</h3>
      <Kv rows={[
        { k: 'Type', v: l.type === 'FIRM' ? 'Firm / agency licence' : l.type ?? '' },
        { k: 'Number', v: <span className="mono">{l.number}</span> },
        { k: 'Verified', v: l.verified ? `Yes, ${fmtTime(l.verified_at)}` : 'No' },
      ]} />
      <small className="muted">Check the number on the official register first. If the agent later changes the number, it must be verified again.</small>
      {l.verified
        ? <button className="btn small" onClick={() => setAsk(false)} data-testid="licence-unverify">Mark as not verified</button>
        : <button className="btn gold" onClick={() => setAsk(true)} data-testid="licence-verify">Mark as verified</button>}
      {ask !== null && (
        <ConfirmDialog
          title={ask ? 'Verify licence' : 'Remove verification'}
          body={<p>{l.type} {l.number} for {profile.email} → <b>{ask ? 'verified' : 'not verified'}</b>.</p>}
          confirmLabel={ask ? 'Mark verified' : 'Remove verification'}
          danger={!ask}
          onClose={() => setAsk(null)}
          onConfirm={async reason => {
            try { await api.verifyLicence(profile.user_id, ask, reason); } catch (e) { throw new Error(errText(e)); }
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Sign-in history (feature 45, per agent): kept 7 years, never changed. */
function LoginHistory({ agent }: { agent: string }) {
  const { api } = useAdmin();
  const [rows, setRows] = useState<LoginRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api.loginLog(agent, 500)); } catch (e) { setErr(errText(e)); }
  }, [api, agent]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="muted" data-testid="login-empty">No sign-ins recorded yet. The main app records them from MainForAdmin-B onwards.</p>;
  const bad = rows.filter(r => isBadEvent(r.event)).length;
  return (
    <div className="stack">
      <small className="muted">{rows.length} entries{bad ? ` · ${bad} failed, locked out, blocked or forced` : ''}. Location is recorded only if the agent had already allowed it.</small>
      <div className="tablewrap">
        <table data-testid="login-table">
          <thead><tr><th>When</th><th>What</th><th>Device</th><th>App</th><th>Location</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.seq}>
                <td>{fmtTime(r.happened_at)}</td>
                <td>{isBadEvent(r.event) ? <span className="tag amber">{EVENT_LABEL[r.event] ?? r.event}</span> : EVENT_LABEL[r.event] ?? r.event}{r.detail ? <><br /><small className="muted">{r.detail}</small></> : null}</td>
                <td>{platformLabel(r.platform)}{r.device ? <><br /><small className="muted">{r.device}</small></> : null}</td>
                <td>{r.app_version ?? ''}</td>
                <td>{r.lat != null && r.lng != null
                  ? <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</a>
                  : <span className="muted">no location</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Terms acceptance and news consent history (feature 53). */
function TermsHistory({ agent }: { agent: string }) {
  const { api } = useAdmin();
  const [rows, setRows] = useState<TermsRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api.termsLog(agent)); } catch (e) { setErr(errText(e)); }
  }, [api, agent]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="muted" data-testid="terms-empty">No answers recorded yet. The agent answers on the first-login screen.</p>;
  return (
    <div className="tablewrap">
      <table data-testid="terms-table">
        <thead><tr><th>When</th><th>What</th><th>Version</th><th>Answer</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.seq}>
              <td>{fmtTime(r.at)}</td>
              <td>{r.kind === 'terms' ? 'Terms and Conditions' : 'News & offers'}</td>
              <td>{r.terms_version ?? ''}</td>
              <td>{r.accepted ? <span className="tag ok">{r.kind === 'terms' ? 'Accepted' : 'Yes'}</span> : <span className="tag">{r.kind === 'terms' ? 'Not accepted' : 'No'}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
