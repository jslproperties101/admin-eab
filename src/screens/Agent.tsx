// Agent Profile Viewer (feature 14) — the core compliance screen. Shows who the agent is and EVERY record they hold,
// including soft-deleted ones (feature 49), with each record's full version history (feature 48). Owner and
// Compliance can export it all to PDF and Excel with a reference number (features 19 later stores them).
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AgentProfile, AgentRecord, Version } from '../api/admin';
import { can } from '../admin/roles';
import { fmtTime, historyLines, labelOf, recordFields, recordTitle, sortCollections } from '../export/reports';
import { exportAgentProfile } from '../export/run';
import { ErrorBox, Kv, Loading } from './ui';

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
          <div className="row"><h1 style={{ fontSize: '1.25rem' }}>{p.name || p.email}</h1>
            <span className={`tag ${p.status === 'active' ? 'ok' : 'red'}`} data-testid="agent-status">{p.status}</span></div>
          <Kv rows={[
            { k: 'Email', v: p.email },
            { k: 'User ID', v: <span className="mono">{p.user_id}</span> },
            { k: 'Licence', v: p.licence ?? <span className="muted">Not provided</span> },
            { k: 'Joined', v: fmtTime(p.joined_at) },
            { k: 'Last sign-in', v: fmtTime(p.last_sign_in_at) },
            { k: 'Workspaces', v: p.workspaces.map(w => `${w.name} (${w.role})`).join(', ') },
          ]} />
        </div>
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
        </div>
        {coll && (
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
