// Regulator Request case files (feature 72) — list and "New case". Also used for an agent's own PDPA request for a
// copy of their data (feature 78): create a case of type "Agent's own request (PDPA access)" for that agent.
// A regulator signed in with temporary access sees only the case(s) they were given.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { CaseFile, CaseStatus, NewCase, RequesterType } from '../api/admin';
import { can } from '../admin/roles';
import { REQUESTER_LABEL } from '../export/pack';
import { ErrorBox, Loading } from './ui';

const STATUS_TABS: { s: CaseStatus | null; label: string }[] = [
  { s: 'open', label: 'Open' }, { s: 'supplied', label: 'Supplied' }, { s: 'closed', label: 'Closed' }, { s: null, label: 'All' },
];
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = { open: 'Open', supplied: 'Supplied', closed: 'Closed' };
export function CaseStatusTag({ s }: { s: CaseStatus }) {
  return <span className={`tag ${s === 'open' ? 'amber' : s === 'supplied' ? 'gold' : 'ok'}`} data-testid="case-status">{CASE_STATUS_LABEL[s]}</span>;
}
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);   // Malaysia date
export const daysLeft = (deadline: string | null) => (deadline ? Math.ceil((Date.parse(`${deadline}T23:59:59+08:00`) - Date.now()) / 86_400_000) : null);

export function CasesScreen() {
  const { api, me, go } = useAdmin();
  const regulator = me.role === 'regulator';
  const [status, setStatus] = useState<CaseStatus | null>(regulator ? null : 'open');
  const [rows, setRows] = useState<CaseFile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api.cases(status, applied)); } catch (e) { setErr(errText(e)); }
  }, [api, status, applied]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stack">
      <div className="row"><h1 className="spacer">{regulator ? 'My case' : 'Regulator Request Cases'}</h1>
        {can(me.role, 'editCases') && !creating && <button className="btn gold" onClick={() => setCreating(true)} data-testid="case-new">New case</button>}</div>
      <p className="muted" style={{ margin: 0 }}>{regulator
        ? 'The case you were given read-only access to. Open it to see the agents and the packs prepared for you.'
        : 'One case per request from JPPH, the police, a court, the agents’ board, or an agent asking for a copy of their own data (PDPA). Cases are kept 7 years and cannot be deleted.'}</p>
      {creating && <NewCaseForm onCancel={() => setCreating(false)} onCreated={c => { setCreating(false); go({ k: 'case', id: c.id }); }} />}
      {!regulator && (
        <>
          <div className="tabs">
            {STATUS_TABS.map(t => <button key={t.label} aria-pressed={status === t.s} onClick={() => setStatus(t.s)} data-testid={`cases-tab-${t.label.toLowerCase()}`}>{t.label}</button>)}
          </div>
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); setApplied(q.trim() || null); }}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Case number, officer, their reference or words in the request" style={{ flex: 1, minWidth: 200 }} aria-label="Filter cases" />
            <button className="btn" type="submit">Filter</button>
          </form>
        </>
      )}
      {err && <ErrorBox text={err} onRetry={() => void load()} />}
      {!rows && !err && <Loading text="Loading cases…" />}
      {rows && rows.length === 0 && <p className="muted" data-testid="cases-empty">No cases{status ? ` that are ${CASE_STATUS_LABEL[status].toLowerCase()}` : ''}.</p>}
      {rows && rows.length > 0 && (
        <div className="list" data-testid="cases-list">
          {rows.map(c => {
            const d = c.status === 'closed' ? null : daysLeft(c.deadline);
            return (
              <button key={c.id} className="item" onClick={() => go({ k: 'case', id: c.id })} data-testid="case-row">
                <span className="row"><b className="spacer">{c.case_no}</b><CaseStatusTag s={c.status} />
                  {d !== null && <span className={`tag ${d < 0 ? 'red' : d <= 3 ? 'amber' : ''}`}>{d < 0 ? `${-d} day(s) late` : `${d} day(s) left`}</span>}</span>
                <small>{REQUESTER_LABEL[c.requester_type] ?? c.requester_type} · {c.requester_name}{c.requester_ref ? ` · ${c.requester_ref}` : ''}</small><br />
                <small className="muted">{c.description.slice(0, 140)}{c.description.length > 140 ? '…' : ''}</small><br />
                <small className="muted">Received {c.received_on}{c.deadline ? ` · deadline ${c.deadline}` : ''} · {typeof c.agents === 'number' ? c.agents : c.agents.length} agent(s) · {typeof c.packs === 'number' ? c.packs : c.packs.length} pack(s)</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewCaseForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: CaseFile) => void }) {
  const { api } = useAdmin();
  const [f, setF] = useState<NewCase>({ requester_type: 'jpph', requester_name: '', requester_ref: '', requester_contact: '', received_on: today(), deadline: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = f.requester_name.trim() && f.description.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.received_on) && (!f.deadline || f.deadline >= f.received_on);
  const save = async () => {
    setBusy(true); setErr(null);
    try { onCreated(await api.caseCreate({ ...f, deadline: f.deadline || undefined })); } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="case-form">
      <h2>New case</h2>
      <label className="field"><span>Who is asking</span>
        <select value={f.requester_type} onChange={e => setF({ ...f, requester_type: e.target.value as RequesterType })} data-testid="case-type">
          {(Object.keys(REQUESTER_LABEL) as RequesterType[]).map(k => <option key={k} value={k}>{REQUESTER_LABEL[k]}</option>)}
        </select></label>
      <label className="field"><span>{f.requester_type === 'pdpa' ? 'Agent’s name (as written in their request)' : 'Officer and office'}</span>
        <input type="text" value={f.requester_name} maxLength={200} onChange={e => setF({ ...f, requester_name: e.target.value })} data-testid="case-name" /></label>
      <label className="field"><span>Their reference number (optional)</span>
        <input type="text" value={f.requester_ref} maxLength={120} onChange={e => setF({ ...f, requester_ref: e.target.value })} data-testid="case-ref" /></label>
      <label className="field"><span>Contact (email / phone / address, optional)</span>
        <input type="text" value={f.requester_contact} maxLength={300} onChange={e => setF({ ...f, requester_contact: e.target.value })} /></label>
      <div className="row">
        <label className="field" style={{ flex: 1, minWidth: 150 }}><span>Received on</span>
          <input type="date" value={f.received_on} onChange={e => setF({ ...f, received_on: e.target.value })} data-testid="case-received" /></label>
        <label className="field" style={{ flex: 1, minWidth: 150 }}><span>Deadline (optional)</span>
          <input type="date" value={f.deadline} min={f.received_on} onChange={e => setF({ ...f, deadline: e.target.value })} data-testid="case-deadline" /></label>
      </div>
      <label className="field"><span>What was asked for</span>
        <textarea value={f.description} maxLength={4000} onChange={e => setF({ ...f, description: e.target.value })} data-testid="case-desc" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row">
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <span className="spacer" />
        <button className="btn gold" disabled={!ok || busy} onClick={() => void save()} data-testid="case-create">{busy ? 'Saving…' : 'Create case'}</button>
      </div>
      <small className="muted">The case number is given by the database (CASE-YYYY-####). Creating it is recorded in the Master Audit Log.</small>
    </div>
  );
}
