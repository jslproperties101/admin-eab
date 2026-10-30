// All agents in one list (features 1, 45, 46, 47, 52, 53). Four views of the same list:
//   All agents        — status, licence, last sign-in, Terms version (Agents Overview, Terms Acceptance, Force Logout)
//   Login Security    — failed sign-ins, lockouts and blocked attempts in the last 30 days, worst first
//   Not active        — suspended, banned or closed accounts, newest change first
//   Licence           — agents who entered a licence number, unverified first
// Opening an agent goes to the Agent Profile, where the actions are. The list is written to the access log.
// AdminBatch009 (feature 95): Owner / Admin can tick up to 50 agents and suspend, re-activate, sign out, tag or message
// them in one go, with one reason (two steps; one batch reference plus one Master Audit Log line per agent).
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { can } from '../admin/roles';
import { BULK_LABEL, BULK_MAX, bulkProblems } from '../admin/insight';
import { cleanTag } from '../admin/compliance';
import { useAdmin, errText } from '../ctx';
import { AgentFilter, AgentRow, BulkAction } from '../api/admin';
import { fmtTime } from '../export/reports';
import { ErrorBox, Loading } from './ui';
import { StatusTag, LicenceTag, platformLabel } from './status';

const TABS: { f: AgentFilter; label: string; help: string }[] = [
  { f: 'all', label: 'All agents', help: 'Every agent with account status, licence, last sign-in and the Terms version they accepted.' },
  { f: 'security', label: 'Login security', help: 'Agents with failed Google sign-ins, lockouts (30 tries on one phone, then 1 hour) or blocked attempts in the last 30 days.' },
  { f: 'not_active', label: 'Suspended / banned / closed', help: 'Accounts that cannot use the app. Open one to re-activate it.' },
  { f: 'licence', label: 'Licence', help: 'Agents who entered a licence number in their profile. Unverified first. Check each number on the board’s website, then tick it verified.' },
];
const PAGE = 100;

export function AgentsScreen({ filter }: { filter: AgentFilter }) {
  const { api, go, me } = useAdmin();
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<string | null>(null);
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (offset = 0) => {
    setErr(null);
    if (!offset) setRows(null);
    try {
      const page = await api.agents(filter, applied, PAGE, offset);
      setRows(r => (offset && r ? [...r, ...page] : page));
      setMore(page.length === PAGE);
    } catch (e) { setErr(errText(e)); }
  }, [api, filter, applied]);
  useEffect(() => { void load(0); }, [load]);
  const submit = (e: FormEvent) => { e.preventDefault(); setApplied(q.trim() || null); };
  const tab = TABS.find(t => t.f === filter)!;

  return (
    <div className="stack">
      <div className="row"><h1 className="spacer">Agents</h1>
        {can(me.role, 'bulkActions') && <button className="btn" aria-pressed={picking} onClick={() => { setPicking(!picking); setSel({}); }} data-testid="bulk-toggle">{picking ? 'Stop choosing' : 'Choose agents'}</button>}</div>
      {picking && <BulkBar sel={sel} rows={rows ?? []} setSel={setSel} onDone={() => { setSel({}); void load(0); }} />}
      <div className="tabs" role="toolbar" aria-label="Agent lists">
        {TABS.map(t => <button key={t.f} aria-pressed={t.f === filter} onClick={() => go({ k: 'agents', filter: t.f })} data-testid={`agents-tab-${t.f}`}>{t.label}</button>)}
      </div>
      <p className="muted" style={{ margin: 0 }}>{tab.help}</p>
      <form className="row" onSubmit={submit}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name, email or user ID" style={{ flex: 1, minWidth: 200 }} aria-label="Filter agents" data-testid="agents-filter" />
        <button className="btn" type="submit">Filter</button>
        {applied && <button className="btn ghost" type="button" onClick={() => { setQ(''); setApplied(null); }}>Clear</button>}
      </form>
      {err && <ErrorBox text={err} onRetry={() => void load(0)} />}
      {!rows && !err && <Loading text="Loading agents…" />}
      {rows && rows.length === 0 && <p className="muted" data-testid="agents-empty">{filter === 'security' ? 'No failed sign-ins or lockouts in the last 30 days.' : filter === 'not_active' ? 'Every account is active.' : filter === 'licence' ? 'No agent has entered a licence number yet.' : 'No agents found.'}</p>}
      {rows && rows.length > 0 && (
        <div className="list" data-testid="agents-list">
          {rows.map(a => (
            <button key={a.user_id} className={`item${picking && sel[a.user_id] ? ' picked' : ''}`} aria-pressed={picking ? !!sel[a.user_id] : undefined}
              onClick={() => picking ? setSel(s => { const n = { ...s }; if (n[a.user_id]) delete n[a.user_id]; else if (Object.keys(n).length < BULK_MAX) n[a.user_id] = a.name || a.email; return n; })
                : go({ k: 'agent', id: a.user_id })} data-testid="agent-row">
              {picking && <span className="row small"><span className={`tick${sel[a.user_id] ? ' on' : ''}`} aria-hidden="true">{sel[a.user_id] ? '☑' : '☐'}</span> {sel[a.user_id] ? 'Chosen' : 'Tap to choose'}</span>}
              <span className="row">
                <b className="spacer">{a.name || a.email}</b>
                <StatusTag status={a.status} />
                <LicenceTag licence={a.licence} />
              </span>
              <small className="muted">{a.email}</small>
              <span className="row small" style={{ marginTop: 4, gap: 14 }}>
                <span>Last sign-in: {a.last_login ? `${fmtTime(a.last_login.at)}${a.last_login.platform ? ` · ${platformLabel(a.last_login.platform)}` : ''}${a.last_login.app_version ? ` · v${a.last_login.app_version}` : ''}` : <span className="muted">none recorded</span>}</span>
                <span>Terms: {a.terms_version ?? <span className="muted">not accepted</span>}</span>
                <span>Records: {a.records}</span>
                {(a.failed_30d > 0 || a.lockouts_30d > 0 || a.blocked_30d > 0) && (
                  <span className="tag amber" data-testid="security-counts">{a.failed_30d} failed · {a.lockouts_30d} lockout{a.lockouts_30d === 1 ? '' : 's'}{a.blocked_30d ? ` · ${a.blocked_30d} blocked` : ''}</span>
                )}
              </span>
              {a.status !== 'active' && a.status_reason && <small className="muted">Reason: {a.status_reason}{a.status_changed_at ? ` (${fmtTime(a.status_changed_at)})` : ''}</small>}
            </button>
          ))}
        </div>
      )}
      {more && rows && <button className="btn" onClick={() => void load(rows.length)}>Show more</button>}
    </div>
  );
}

/** AdminBatch009 — what to do with the ticked agents. Two steps; the database does all or nothing. */
function BulkBar({ sel, rows, setSel, onDone }: { sel: Record<string, string>; rows: AgentRow[]; setSel: (s: Record<string, string>) => void; onDone: () => void }) {
  const { api, go } = useAdmin();
  const [action, setAction] = useState<BulkAction | 'message' | ''>('');
  const [reason, setReason] = useState('');
  const [tag, setTag] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = Object.keys(sel);
  const problems = bulkProblems(action, ids.length, reason, tag);
  const pickAll = () => { const n: Record<string, string> = { ...sel }; for (const r of rows) { if (Object.keys(n).length >= BULK_MAX) break; n[r.user_id] = r.name || r.email; } setSel(n); };
  const go2 = () => {
    if (action === 'message') { go({ k: 'broadcasts', to: ids.map(id => ({ id, label: sel[id] })) }); return; }
    setStep(2);
  };
  const run = async () => {
    if (!action || action === 'message') return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.bulkAction(action, ids, reason.trim(), action === 'tag_add' || action === 'tag_remove' ? cleanTag(tag) : null);
      setMsg({ ok: true, text: `${r.ref}: done for ${r.count} agent${r.count === 1 ? '' : 's'}. Each one is in the Master Audit Log.` });
      setStep(1); setReason(''); setAction(''); onDone();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); setStep(1); } finally { setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="bulk-bar">
      <div className="row"><b className="spacer" data-testid="bulk-count">{ids.length} of at most {BULK_MAX} agents chosen</b>
        <button className="btn small" onClick={pickAll} data-testid="bulk-all">Choose all shown</button>
        <button className="btn small" onClick={() => setSel({})}>Clear</button></div>
      {step === 1 ? (
        <>
          <div className="grid2">
            <label className="field"><span>What to do</span>
              <select value={action} onChange={e => setAction(e.target.value as BulkAction | 'message' | '')} data-testid="bulk-action">
                <option value="">— choose —</option>
                {(Object.keys(BULK_LABEL) as (BulkAction | 'message')[]).map(k => <option key={k} value={k}>{BULK_LABEL[k]}</option>)}
              </select></label>
            {(action === 'tag_add' || action === 'tag_remove') && <label className="field"><span>Tag</span><input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. vip" data-testid="bulk-tag" /></label>}
          </div>
          {action && action !== 'message' && <label className="field"><span>Reason (saved in the Master Audit Log for every agent)</span>
            <textarea rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} data-testid="bulk-reason" /></label>}
          {action === 'message' && <small className="muted">Opens a new email or WhatsApp broadcast for exactly these agents. You write it and send it there.</small>}
          {problems.length > 0 && ids.length > 0 && action && <ul className="error small" data-testid="bulk-problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
          <div className="row"><span className="spacer" /><button className="btn gold" disabled={problems.length > 0} onClick={go2} data-testid="bulk-continue">Continue</button></div>
        </>
      ) : (
        <>
          <div className="notice warn" data-testid="bulk-confirm">Please confirm: <b>{BULK_LABEL[action as BulkAction]}</b>{action === 'tag_add' || action === 'tag_remove' ? ` “${cleanTag(tag)}”` : ''} for {ids.length} agent{ids.length === 1 ? '' : 's'}:
            {' '}{ids.slice(0, 10).map(id => sel[id]).join(', ')}{ids.length > 10 ? ` and ${ids.length - 10} more` : ''}.<br />Reason: <i>“{reason.trim()}”</i></div>
          <div className="row"><button className="btn" disabled={busy} onClick={() => setStep(1)}>Back</button><span className="spacer" />
            <button className={`btn ${action === 'suspend' ? 'danger' : 'gold'}`} disabled={busy} onClick={() => void run()} data-testid="bulk-do">{busy ? 'Working…' : 'Do it'}</button></div>
        </>
      )}
      {msg && <p className={`small ${msg.ok ? '' : 'error'}`} role="status" data-testid="bulk-msg">{msg.text}</p>}
    </div>
  );
}
