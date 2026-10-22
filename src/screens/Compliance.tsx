// AdminBatch007 — Compliance core (features 50, 51, 82, 88, 91, 94).
//   PDPA requests      log every written request; decision, outcome, dates; 21-day answer rule for access / correction
//   Complaints         complaints from buyers / public about agents; status, outcome, case link
//   Legal holds        freeze an agent's records (the database refuses deletes while on hold)
//   Licence expiry     expiry dates entered here; warnings at 60 / 30 / 7 days
//   Retention          what is older than 7 years, per kind and per agent; review recorded; NOTHING is deleted
//   InternalBox        on the Agent Profile: tags, internal notes, holds, complaints / PDPA counts, licence expiry
// Every change needs a reason or note and goes into the Master Audit Log; opening lists goes into the access log.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import {
  AgentInternal, CaseFile, ComplaintCategory, ComplaintChannel, ComplaintStatus, LegalHold, LicenceExpiry, NewComplaint, NewPdpa,
  PdpaKind, PdpaStatus, Retention, SearchHit,
} from '../api/admin';
import {
  COMPLAINT_CATEGORY, COMPLAINT_CHANNEL, COMPLAINT_STATUS, PDPA_KIND, PDPA_STATUS, TAG_RE, cleanTag, complaintProblems, deadlineText,
  expiryLevel, expiryText, pdpaDeadline, pdpaProblems,
} from '../admin/compliance';
import { todayKL } from '../admin/health';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Kv, Loading } from './ui';

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => { setErr(null); try { setData(await fn()); } catch (e) { setErr(errText(e)); } }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load, setData };
}
type Confirm = null | { title: string; body: ReactNode; label: string; danger?: boolean; run: (reason: string) => Promise<void> };
const tagLevel = (l: 'ok' | 'amber' | 'red' | 'expired' | 'none') => (l === 'red' || l === 'expired' ? 'red' : l === 'amber' ? 'amber' : l === 'ok' ? 'ok' : '');

/** Find an agent by name or email (global search, agents only). */
function AgentPicker({ value, onPick }: { value: { id: string; label: string } | null; onPick: (a: { id: string; label: string } | null) => void }) {
  const { api } = useAdmin();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (value) return <div className="row"><span className="tag gold">{value.label}</span><button className="btn small" type="button" onClick={() => onPick(null)}>Change</button></div>;
  const find = async () => { setErr(null); try { setHits((await api.search(q.trim())).filter(h => h.kind === 'agent')); } catch (e) { setErr(errText(e)); } };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <input className="spacer" value={q} onChange={e => setQ(e.target.value)} placeholder="Agent name or email (optional)" data-testid="agent-q"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (q.trim().length >= 2) void find(); } }} />
        <button className="btn small" type="button" disabled={q.trim().length < 2} onClick={() => void find()} data-testid="agent-find">Find</button>
      </div>
      {err && <small className="error">{err}</small>}
      {hits && (hits.length === 0 ? <small className="muted">No agent found.</small> : hits.slice(0, 8).map(h => (
        <button key={h.user_id} type="button" className="item" onClick={() => { onPick({ id: h.user_id, label: h.name ? `${h.name} (${h.email})` : h.email }); setHits(null); }} data-testid="agent-hit">
          {h.name ?? h.email} <small className="muted">{h.email}</small></button>
      )))}
    </div>
  );
}

function CasePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { api, me } = useAdmin();
  const [cases, setCases] = useState<CaseFile[] | null>(null);
  useEffect(() => { if (can(me.role, 'viewCases')) api.cases().then(setCases).catch(() => setCases([])); }, [api, me.role]);
  if (!can(me.role, 'viewCases')) return null;
  return (
    <label className="field"><span>Link to a regulator case file (optional)</span>
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} data-testid="case-pick">
        <option value="">— none —</option>
        {(cases ?? []).map(c => <option key={c.id} value={c.id}>{c.case_no} · {c.requester_name}</option>)}
      </select></label>
  );
}


function Events({ items, words }: { items: { id: number; kind: string; body: string | null; from_status: string | null; to_status: string | null; by_email: string | null; at: string }[]; words: Record<string, string> }) {
  return (
    <ol className="history" data-testid="history">
      {items.map(e => (
        <li key={e.id}><small className="muted">{fmtTime(e.at)} · {e.by_email}</small><br />
          {e.kind === 'created' ? <b>Logged</b> : e.kind === 'status' ? <><b>{words[e.from_status ?? ''] ?? e.from_status} → {words[e.to_status ?? ''] ?? e.to_status}</b>{e.body && <> — {e.body}</>}</>
            : e.kind === 'updated' ? <><b>Updated</b>{e.body && <> — {e.body}</>}</> : <span>{e.body}</span>}
        </li>
      ))}
    </ol>
  );
}

// =====================================================================================================================
// PDPA requests (50)
// =====================================================================================================================
export function PdpaScreen() {
  const { api, go } = useAdmin();
  const [filter, setFilter] = useState<PdpaStatus | 'active' | null>('active');
  const { data, err, load } = useLoad(() => api.pdpaList(filter), [api, filter]);
  const [adding, setAdding] = useState(false);
  const today = todayKL();
  return (
    <div className="stack" data-testid="pdpa">
      <div className="row"><h1 className="spacer">PDPA requests</h1><button className="btn small gold" onClick={() => setAdding(a => !a)} data-testid="pdpa-new">{adding ? 'Close' : 'Log a request'}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Every written request about personal data. Access and correction requests must be answered within 21 days.
        A deletion request is only logged here: nothing is deleted until your lawyer's answer and a separate approved step.</p>
      {adding && <PdpaForm onDone={id => { setAdding(false); go({ k: 'pdpa_req', id }); }} />}
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {([['active', 'Open + in progress'], ['done', 'Done'], ['refused', 'Refused'], [null, 'All']] as const).map(([k, t]) =>
          <button key={String(k)} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`pfilter-${k ?? 'all'}`}>{t}</button>)}
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : data.requests.length === 0 ? <p className="muted">No requests here.</p> : (
        <div className="stack" data-testid="pdpa-list">
          {data.requests.map(r => {
            const d = pdpaDeadline(r, today);
            return (
              <button key={r.id} className="item ticket" onClick={() => go({ k: 'pdpa_req', id: r.id })} data-testid="pdpa-row">
                <div className="row"><b className="code">{r.ref}</b><span className="tag">{PDPA_STATUS[r.status]}</span><span className="tag">{PDPA_KIND[r.kind]}</span>
                  {r.agent_on_hold && <span className="tag red">Legal hold</span>}<span className="spacer" />
                  {d && <span className={`tag ${d.level === 'ok' ? 'ok' : d.level}`} data-testid="pdpa-due">{deadlineText(d)}</span>}</div>
                <span>{r.requester_name}{r.agent_email ? ` · ${r.agent_email}` : ''} · received {r.received_on}</span>
                <small className="muted clamp">{r.summary}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PdpaForm({ onDone }: { onDone: (id: string) => void }) {
  const { api } = useAdmin();
  const today = todayKL();
  const [agent, setAgent] = useState<{ id: string; label: string } | null>(null);
  const [f, setF] = useState<NewPdpa>({ requester_name: '', requester_contact: '', received_on: today, kind: 'access', details: '' });
  const [caseId, setCaseId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problems = pdpaProblems(f, today);
  const save = async () => {
    setTouched(true); if (problems.length) return;
    setBusy(true); setErr(null);
    try { const r = await api.pdpaCreate({ ...f, agent_user: agent?.id ?? null, case_id: caseId }); onDone(r.id); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="pdpa-form">
      <h3>Log a PDPA request</h3>
      <div className="field"><span>Agent it is about (if any)</span><AgentPicker value={agent} onPick={setAgent} /></div>
      <div className="grid2">
        <label className="field"><span>Who asked</span><input value={f.requester_name} onChange={e => setF({ ...f, requester_name: e.target.value })} data-testid="pdpa-name" /></label>
        <label className="field"><span>Their email / phone / address</span><input value={f.requester_contact ?? ''} onChange={e => setF({ ...f, requester_contact: e.target.value })} /></label>
        <label className="field"><span>Received on</span><input type="date" max={today} value={f.received_on} onChange={e => setF({ ...f, received_on: e.target.value })} data-testid="pdpa-received" /></label>
        <label className="field"><span>Kind of request</span>
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as PdpaKind })} data-testid="pdpa-kind">
            {(Object.keys(PDPA_KIND) as PdpaKind[]).map(k => <option key={k} value={k}>{PDPA_KIND[k]}</option>)}
          </select></label>
      </div>
      <label className="field"><span>What was asked (copy from the letter or email)</span><textarea rows={4} maxLength={4000} value={f.details} onChange={e => setF({ ...f, details: e.target.value })} data-testid="pdpa-details" /></label>
      <CasePicker value={caseId} onChange={setCaseId} />
      {touched && problems.length > 0 && <ul className="error small">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={busy} onClick={() => void save()} data-testid="pdpa-save">{busy ? 'Saving…' : 'Log request'}</button></div>
    </div>
  );
}

export function PdpaRequestScreen({ id }: { id: string }) {
  const { api, go, me } = useAdmin();
  const { data: r, err, setData } = useLoad(() => api.pdpaGet(id), [api, id]);
  const [status, setStatus] = useState<PdpaStatus | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [supplied, setSupplied] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} />;
  if (!r) return <Loading />;
  const today = todayKL();
  const d = pdpaDeadline(r, today);
  const patch = {
    ...(status && status !== r.status ? { status } : {}),
    ...(decision !== null && decision !== (r.decision ?? '') ? { decision, decided_on: today } : {}),
    ...(outcome !== null && outcome !== (r.outcome ?? '') ? { outcome } : {}),
    ...(supplied !== null && supplied !== (r.supplied_on ?? '') ? { supplied_on: supplied } : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const doneBlocked = r.kind === 'deletion' && r.agent_on_hold && status === 'done';
  const save = async () => {
    setBusy(true); setAErr(null);
    try {
      const n = changed ? await api.pdpaUpdate(r.id, patch, note.trim()) : await api.pdpaNote(r.id, note.trim());
      setData(n); setNote(''); setStatus(null); setDecision(null); setOutcome(null); setSupplied(null);
    } catch (e) { setAErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="stack" data-testid="pdpa-req">
      <div className="row"><h1 className="spacer code">{r.ref}</h1><span className="tag" data-testid="pdpa-status">{PDPA_STATUS[r.status]}</span>
        {d && <span className={`tag ${d.level === 'ok' ? 'ok' : d.level}`}>{deadlineText(d)}</span>}</div>
      {r.agent_on_hold && <p className="notice error small" data-testid="pdpa-hold">This agent is on legal hold. A deletion request cannot be marked done while the hold is on.</p>}
      {r.kind === 'deletion' && <p className="notice warn small">Logging only: nothing is deleted from this screen. Deletion inside the 7-year period waits for the lawyer's answer.</p>}
      <div className="card"><Kv rows={[
        { k: 'Kind', v: PDPA_KIND[r.kind] }, { k: 'Who asked', v: `${r.requester_name}${r.requester_contact ? ` · ${r.requester_contact}` : ''}` },
        { k: 'Agent', v: r.agent_user ? <button className="linkbtn" onClick={() => go({ k: 'agent', id: r.agent_user! })}>{r.agent_name ?? r.agent_email}</button> : null },
        { k: 'Received', v: r.received_on }, { k: 'What was asked', v: <span style={{ whiteSpace: 'pre-wrap' }}>{r.details}</span> },
        { k: 'Decision', v: r.decision ? `${r.decision}${r.decided_on ? ` (${r.decided_on})` : ''}` : null },
        { k: 'Supplied on', v: r.supplied_on }, { k: 'Outcome', v: r.outcome },
        { k: 'Case file', v: r.case_no && r.case_id ? <button className="linkbtn" onClick={() => go({ k: 'case', id: r.case_id! })}>{r.case_no}</button> : null },
      ]} /></div>
      {r.kind === 'access' && r.agent_user && can(me.role, 'export') && <p className="small muted" style={{ margin: 0 }}>To supply the copy: open the agent's profile and export PDF / Excel (or make a PDPA case pack), then fill in “Supplied on”.</p>}
      <h2>History</h2>
      <Events items={r.history ?? []} words={PDPA_STATUS} />
      <div className="card boxed stack" data-testid="pdpa-actions">
        <div className="row"><span className="muted small">Status:</span>
          {(Object.keys(PDPA_STATUS) as PdpaStatus[]).filter(s => s !== r.status).map(s =>
            <button key={s} className={`btn small ${status === s ? 'gold' : ''}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)} data-testid={`pdpa-to-${s}`}>{PDPA_STATUS[s]}</button>)}
        </div>
        <label className="field"><span>Decision</span><textarea rows={2} value={decision ?? r.decision ?? ''} onChange={e => setDecision(e.target.value)} data-testid="pdpa-decision" /></label>
        <div className="grid2">
          <label className="field"><span>Supplied on</span><input type="date" max={today} value={supplied ?? r.supplied_on ?? ''} onChange={e => setSupplied(e.target.value)} data-testid="pdpa-supplied" /></label>
          <label className="field"><span>Outcome</span><input value={outcome ?? r.outcome ?? ''} onChange={e => setOutcome(e.target.value)} data-testid="pdpa-outcome" /></label>
        </div>
        <label className="field"><span>{changed ? 'Reason for this change (needed)' : 'Note'}</span><textarea rows={2} maxLength={4000} value={note} onChange={e => setNote(e.target.value)} data-testid="pdpa-note" /></label>
        {doneBlocked && <p className="error small">This agent is on legal hold: release the hold first.</p>}
        {aErr && <p className="error small" role="alert">{aErr}</p>}
        <div className="row"><span className="spacer" />
          <button className="btn gold" disabled={busy || !note.trim() || doneBlocked} onClick={() => void save()} data-testid="pdpa-apply">{busy ? 'Saving…' : changed ? 'Save change' : 'Save note'}</button></div>
        <small className="muted">Every step is kept for good and goes into the Master Audit Log.</small>
      </div>
    </div>
  );
}

// =====================================================================================================================
// Complaints (91)
// =====================================================================================================================
export function ComplaintsScreen() {
  const { api, go } = useAdmin();
  const [filter, setFilter] = useState<ComplaintStatus | 'active' | null>('active');
  const { data, err, load } = useLoad(() => api.complaints(filter), [api, filter]);
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack" data-testid="complaints">
      <div className="row"><h1 className="spacer">Complaints</h1><button className="btn small gold" onClick={() => setAdding(a => !a)} data-testid="complaint-new">{adding ? 'Close' : 'Log a complaint'}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Complaints from buyers, tenants or the public about an agent. Kept for good; link one to a regulator case file when it becomes one.</p>
      {adding && <ComplaintForm onDone={id => { setAdding(false); go({ k: 'complaint', id }); }} />}
      {data && <div className="row">{(Object.keys(COMPLAINT_CATEGORY) as ComplaintCategory[]).filter(k => data.by_category[k]).map(k =>
        <span key={k} className="tag">{COMPLAINT_CATEGORY[k]}: {data.by_category[k]}</span>)}</div>}
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {([['active', 'Open + investigating'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['referred', 'Referred'], [null, 'All']] as const).map(([k, t]) =>
          <button key={String(k)} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`cfilter-${k ?? 'all'}`}>{t}</button>)}
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : data.complaints.length === 0 ? <p className="muted">No complaints here.</p> : (
        <div className="stack" data-testid="complaint-list">
          {data.complaints.map(c => (
            <button key={c.id} className="item ticket" onClick={() => go({ k: 'complaint', id: c.id })} data-testid="complaint-row">
              <div className="row"><b className="code">{c.ref}</b><span className="tag">{COMPLAINT_STATUS[c.status]}</span><span className="tag">{COMPLAINT_CATEGORY[c.category]}</span>
                <span className="spacer" /><small className="muted">received {c.received_on}</small></div>
              <span>{c.agent_name ?? c.agent_email ?? 'No agent named'}{c.listing_ref ? ` · listing ${c.listing_ref}` : ''} · from {c.complainant_name}</span>
              <small className="muted clamp">{c.summary}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComplaintForm({ onDone }: { onDone: (id: string) => void }) {
  const { api } = useAdmin();
  const today = todayKL();
  const [agent, setAgent] = useState<{ id: string; label: string } | null>(null);
  const [f, setF] = useState<NewComplaint>({ complainant_name: '', complainant_contact: '', received_on: today, channel: 'phone', category: 'misleading_listing', listing_ref: '', details: '' });
  const [caseId, setCaseId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problems = complaintProblems(f, today);
  const save = async () => {
    setTouched(true); if (problems.length) return;
    setBusy(true); setErr(null);
    try { const c = await api.complaintCreate({ ...f, agent_user: agent?.id ?? null, case_id: caseId }); onDone(c.id); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="complaint-form">
      <h3>Log a complaint</h3>
      <div className="field"><span>Agent complained about</span><AgentPicker value={agent} onPick={setAgent} /></div>
      <div className="grid2">
        <label className="field"><span>Who complained</span><input value={f.complainant_name} onChange={e => setF({ ...f, complainant_name: e.target.value })} data-testid="cmp-name" /></label>
        <label className="field"><span>Their email / phone</span><input value={f.complainant_contact ?? ''} onChange={e => setF({ ...f, complainant_contact: e.target.value })} /></label>
        <label className="field"><span>Received on</span><input type="date" max={today} value={f.received_on} onChange={e => setF({ ...f, received_on: e.target.value })} /></label>
        <label className="field"><span>How it came in</span>
          <select value={f.channel} onChange={e => setF({ ...f, channel: e.target.value as ComplaintChannel })}>{(Object.keys(COMPLAINT_CHANNEL) as ComplaintChannel[]).map(k => <option key={k} value={k}>{COMPLAINT_CHANNEL[k]}</option>)}</select></label>
        <label className="field"><span>About</span>
          <select value={f.category} onChange={e => setF({ ...f, category: e.target.value as ComplaintCategory })} data-testid="cmp-category">{(Object.keys(COMPLAINT_CATEGORY) as ComplaintCategory[]).map(k => <option key={k} value={k}>{COMPLAINT_CATEGORY[k]}</option>)}</select></label>
        <label className="field"><span>Listing reference (if any)</span><input value={f.listing_ref ?? ''} onChange={e => setF({ ...f, listing_ref: e.target.value })} data-testid="cmp-listing" /></label>
      </div>
      <label className="field"><span>What happened</span><textarea rows={4} maxLength={4000} value={f.details} onChange={e => setF({ ...f, details: e.target.value })} data-testid="cmp-details" /></label>
      <CasePicker value={caseId} onChange={setCaseId} />
      {touched && problems.length > 0 && <ul className="error small">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={busy} onClick={() => void save()} data-testid="cmp-save">{busy ? 'Saving…' : 'Log complaint'}</button></div>
    </div>
  );
}

export function ComplaintScreen({ id }: { id: string }) {
  const { api, go } = useAdmin();
  const { data: c, err, setData } = useLoad(() => api.complaintGet(id), [api, id]);
  const [status, setStatus] = useState<ComplaintStatus | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} />;
  if (!c) return <Loading />;
  const patch = {
    ...(status && status !== c.status ? { status } : {}),
    ...(outcome !== null && outcome !== (c.outcome ?? '') ? { outcome } : {}),
    ...(caseId !== undefined && caseId !== c.case_id ? { case_id: caseId } : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const save = async () => {
    setBusy(true); setAErr(null);
    try {
      setData(changed ? await api.complaintUpdate(c.id, patch, note.trim()) : await api.complaintNote(c.id, note.trim()));
      setNote(''); setStatus(null); setOutcome(null); setCaseId(undefined);
    } catch (e) { setAErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="stack" data-testid="complaint">
      <div className="row"><h1 className="spacer code">{c.ref}</h1><span className="tag" data-testid="cmp-status">{COMPLAINT_STATUS[c.status]}</span></div>
      <div className="card"><Kv rows={[
        { k: 'About', v: COMPLAINT_CATEGORY[c.category] },
        { k: 'Agent', v: c.agent_user ? <><button className="linkbtn" onClick={() => go({ k: 'agent', id: c.agent_user! })}>{c.agent_name ?? c.agent_email}</button>
          {c.agent_complaints && c.agent_complaints > 1 ? <span className="tag amber"> {c.agent_complaints} complaints in total</span> : null}</> : null },
        { k: 'From', v: `${c.complainant_name}${c.complainant_contact ? ` · ${c.complainant_contact}` : ''} (${COMPLAINT_CHANNEL[c.channel]})` },
        { k: 'Received', v: c.received_on }, { k: 'Listing', v: c.listing_ref },
        { k: 'What happened', v: <span style={{ whiteSpace: 'pre-wrap' }}>{c.details}</span> }, { k: 'Outcome', v: c.outcome },
        { k: 'Case file', v: c.case_no && c.case_id ? <button className="linkbtn" onClick={() => go({ k: 'case', id: c.case_id! })}>{c.case_no}</button> : null },
      ]} /></div>
      <h2>History</h2>
      <Events items={c.history ?? []} words={COMPLAINT_STATUS} />
      <div className="card boxed stack" data-testid="cmp-actions">
        <div className="row"><span className="muted small">Status:</span>
          {(Object.keys(COMPLAINT_STATUS) as ComplaintStatus[]).filter(s => s !== c.status).map(s =>
            <button key={s} className={`btn small ${status === s ? 'gold' : ''}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)} data-testid={`cmp-to-${s}`}>{COMPLAINT_STATUS[s]}</button>)}
        </div>
        <label className="field"><span>Outcome</span><input value={outcome ?? c.outcome ?? ''} onChange={e => setOutcome(e.target.value)} data-testid="cmp-outcome" /></label>
        <CasePicker value={caseId === undefined ? c.case_id : caseId} onChange={setCaseId} />
        <label className="field"><span>{changed ? 'Reason for this change (needed)' : 'Note'}</span><textarea rows={2} maxLength={4000} value={note} onChange={e => setNote(e.target.value)} data-testid="cmp-note" /></label>
        {aErr && <p className="error small" role="alert">{aErr}</p>}
        <div className="row"><span className="spacer" /><button className="btn gold" disabled={busy || !note.trim()} onClick={() => void save()} data-testid="cmp-apply">{busy ? 'Saving…' : changed ? 'Save change' : 'Save note'}</button></div>
      </div>
    </div>
  );
}

// =====================================================================================================================
// Legal holds (88)
// =====================================================================================================================
export function HoldsScreen() {
  const { api, me, go } = useAdmin();
  const [active, setActive] = useState(true);
  const { data, err, load } = useLoad<LegalHold[]>(() => api.holds(active), [api, active]);
  const [agent, setAgent] = useState<{ id: string; label: string } | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [c, setC] = useState<Confirm>(null);
  const edit = can(me.role, 'placeHold');
  return (
    <div className="stack" data-testid="holds">
      <h1>Legal holds</h1>
      <p className="muted small" style={{ margin: 0 }}>While an agent is on hold, the database refuses to delete any of their records, retention lists them as “on hold”, and a PDPA deletion request for them cannot be marked done.</p>
      {edit && (
        <div className="card boxed stack" data-testid="hold-form">
          <h3>Put an agent on hold</h3>
          <AgentPicker value={agent} onPick={setAgent} />
          <CasePicker value={caseId} onChange={setCaseId} />
          <div className="row"><span className="spacer" /><button className="btn danger" disabled={!agent} data-testid="hold-place" onClick={() => setC({
            title: `Legal hold on ${agent!.label}`, body: <p>None of this agent's records can be deleted until the hold is released. The agent is not told.</p>,
            label: 'Place hold', danger: true, run: async reason => { await api.holdPlace(agent!.id, reason, caseId); setAgent(null); setCaseId(null); await load(); } })}>Place hold</button></div>
        </div>
      )}
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        <button aria-pressed={active} onClick={() => setActive(true)}>On hold now</button>
        <button aria-pressed={!active} onClick={() => setActive(false)} data-testid="holds-all">All, with released</button>
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : data.length === 0 ? <p className="muted">No holds.</p> : (
        <div className="tablewrap dash-table"><table data-testid="hold-list">
          <thead><tr><th>Agent</th><th>Why</th><th>Placed</th><th>Released</th><th /></tr></thead>
          <tbody>{data.map(h => (
            <tr key={h.id}>
              <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: h.agent_user })}>{h.agent_name ?? h.agent_email}</button>{h.case_no && <><br /><small className="muted">{h.case_no}</small></>}</td>
              <td className="small">{h.reason}</td>
              <td className="small">{fmtTime(h.placed_at)}<br />{h.placed_by_email}</td>
              <td className="small">{h.released_at ? <>{fmtTime(h.released_at)}<br />{h.release_reason}</> : <span className="tag red">On hold</span>}</td>
              <td>{edit && !h.released_at && <button className="btn small" data-testid="hold-release" onClick={() => setC({
                title: 'Release this legal hold', body: <p>{h.agent_email}'s records can be deleted again by later, approved steps (nothing is deleted now).</p>,
                label: 'Release', run: async reason => { await api.holdRelease(h.id, reason); await load(); } })}>Release</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

// =====================================================================================================================
// Licence expiry (82)
// =====================================================================================================================
export function LicencesScreen() {
  const { api, go } = useAdmin();
  const [within, setWithin] = useState(60);
  const { data, err, load } = useLoad<LicenceExpiry>(() => api.licenceExpiry(within), [api, within]);
  const [c, setC] = useState<Confirm>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  return (
    <div className="stack" data-testid="licences">
      <h1>Licence expiry</h1>
      <p className="muted small" style={{ margin: 0 }}>REN / REA / PEA renewal dates, entered from the agent's licence card. Agents enter only the number in the main app.</p>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : (
        <>
          <div className="stats">
            <div className={`stat ${data.counts.expired ? 'red' : ''}`}><span className="l">Expired</span><b className="v">{data.counts.expired}</b></div>
            <div className={`stat ${data.counts.in_7 ? 'red' : ''}`}><span className="l">Within 7 days</span><b className="v">{data.counts.in_7}</b></div>
            <div className={`stat ${data.counts.in_30 ? 'amber' : ''}`}><span className="l">Within 30 days</span><b className="v">{data.counts.in_30}</b></div>
            <div className="stat"><span className="l">Within 60 days</span><b className="v">{data.counts.in_60}</b></div>
            <div className={`stat ${data.counts.no_date ? 'amber' : ''}`}><span className="l">No date entered</span><b className="v">{data.counts.no_date}</b><small className="muted">of {data.counts.licences} licences</small></div>
          </div>
          <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
            {[30, 60, 365].map(w => <button key={w} aria-pressed={within === w} onClick={() => setWithin(w)}>Expiring within {w} days + no date</button>)}
          </div>
          {data.agents.length === 0 ? <p className="muted">Nothing expiring in this period.</p> : (
            <div className="tablewrap dash-table"><table data-testid="licence-list">
              <thead><tr><th>Agent</th><th>Licence</th><th>Expiry</th><th>Set the date</th></tr></thead>
              <tbody>{data.agents.map(a => {
                const lvl = expiryLevel(a.days_left);
                return (
                  <tr key={a.user_id}>
                    <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: a.user_id })}>{a.name ?? a.email}</button></td>
                    <td className="small">{a.type} {a.number} {a.verified ? <span className="tag ok">verified</span> : <span className="tag amber">not verified</span>}</td>
                    <td><span className={`tag ${tagLevel(lvl)}`} data-testid="expiry-tag">{expiryText(a.days_left, a.expires_on)}</span></td>
                    <td className="row">
                      <input type="date" value={dates[a.user_id] ?? a.expires_on ?? ''} onChange={e => setDates({ ...dates, [a.user_id]: e.target.value })} data-testid="expiry-date" style={{ width: 'auto' }} />
                      <button className="btn small" disabled={!dates[a.user_id] || dates[a.user_id] === a.expires_on} data-testid="expiry-save" onClick={() => setC({
                        title: `Licence expiry for ${a.email}`, body: <p>{a.type} {a.number}: expires on <b>{dates[a.user_id]}</b>.</p>, label: 'Save',
                        run: async reason => { await api.setLicenceExpiry(a.user_id, dates[a.user_id], reason); await load(); } })}>Save</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </>
      )}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

// =====================================================================================================================
// Retention (51) — nothing is deleted
// =====================================================================================================================
const KIND_WORD: Record<string, string> = { records: 'App records (listings, contacts …)', records_on_hold: '… of which on legal hold', versions: 'Saved versions of records',
  sign_ins: 'Sign-in log rows', problem_reports: 'Problem reports', usage_days: 'Daily usage totals' };
export function RetentionScreen() {
  const { api, me, go } = useAdmin();
  const { data, err, load } = useLoad<Retention>(() => api.retention(), [api]);
  const [c, setC] = useState<Confirm>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const review = (decision: 'keep' | 'approve_later') => setC({
    title: decision === 'keep' ? 'Record review: keep everything' : 'Record review: approved for later deletion',
    body: <p>{decision === 'keep' ? 'Everything older than 7 years is kept for now.' : 'You agree these may be deleted later. Nothing is deleted now: deletion is a separate, approved step after the lawyer’s answer.'}
      <br />The counts below are saved with your review.</p>,
    label: 'Record review', run: async note => { await api.retentionReview(decision, note); await load(); },
  });
  return (
    <div className="stack" data-testid="retention">
      <h1>Retention (7 years)</h1>
      <p className="notice warn small" data-testid="no-delete">Nothing is deleted from this screen, and nothing is ever deleted automatically. Deleting records older than 7 years needs the lawyer’s answer and a separate approved batch.</p>
      <p className="muted small" style={{ margin: 0 }}>Older than {data.cutoff} (7 years before {data.today}). Opening this list is recorded.</p>
      <div className="tablewrap dash-table"><table data-testid="retention-counts">
        <thead><tr><th>Kind</th><th>Older than 7 years now</th><th>One year from now</th></tr></thead>
        <tbody>{(Object.keys(KIND_WORD) as (keyof typeof data.counts)[]).map(k => (
          <tr key={k}><td>{KIND_WORD[k]}</td><td>{data.counts[k]}</td><td>{data.next_year[k]}</td></tr>
        ))}</tbody>
      </table></div>
      <h2>Agents with records older than 7 years</h2>
      {data.agents.length === 0 ? <p className="muted">None yet.</p> : (
        <div className="tablewrap dash-table"><table data-testid="retention-agents">
          <thead><tr><th>Agent</th><th>Old records</th><th>Oldest</th><th /></tr></thead>
          <tbody>{data.agents.map(a => <tr key={a.user_id}><td><button className="linkbtn" onClick={() => go({ k: 'agent', id: a.user_id })}>{a.name ?? a.email}</button></td>
            <td>{a.records}</td><td className="small">{fmtTime(a.oldest)}</td><td>{a.on_hold && <span className="tag red">Legal hold</span>}</td></tr>)}</tbody>
        </table></div>
      )}
      {can(me.role, 'reviewRetention') && (
        <div className="row"><span className="spacer" />
          <button className="btn" onClick={() => review('keep')} data-testid="ret-keep">Record review: keep</button>
          <button className="btn gold" onClick={() => review('approve_later')} data-testid="ret-approve">Record review: approve for later</button></div>
      )}
      <h2>Reviews</h2>
      {data.reviews.length === 0 ? <p className="muted">No review recorded yet.</p> : (
        <ol className="history" data-testid="retention-reviews">{data.reviews.map(r => (
          <li key={r.id}><small className="muted">{fmtTime(r.at)} · {r.by_email}</small><br /><b>{r.decision === 'keep' ? 'Keep' : 'Approved for later deletion'}</b> — {r.note}
            <br /><small className="muted">{r.counts.records} records, {r.counts.sign_ins} sign-ins, {r.counts.versions} versions older than {r.cutoff}</small></li>
        ))}</ol>
      )}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

// =====================================================================================================================
// On the Agent Profile: internal tags, notes, legal hold, counts, licence expiry (94, 88, 82)
// =====================================================================================================================
export function InternalBox({ userId, email }: { userId: string; email: string }) {
  const { api, me, go } = useAdmin();
  const { data, err, load } = useLoad<AgentInternal>(() => api.agentInternal(userId), [api, userId]);
  const [tag, setTag] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  const [expiry, setExpiry] = useState('');
  const [c, setC] = useState<Confirm>(null);
  if (err) return <ErrorBox text={err} />;
  if (!data) return <Loading text="Loading internal notes…" />;
  const t = cleanTag(tag);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setAErr(null); try { await fn(); await load(); } catch (e) { setAErr(errText(e)); } finally { setBusy(false); } };
  const days = data.licence_expires_on ? Math.round((Date.parse(`${data.licence_expires_on}T00:00:00Z`) - Date.parse(`${todayKL()}T00:00:00Z`)) / 86_400_000) : null;
  const active = data.holds.find(h => !h.released_at);
  return (
    <div className="card stack" data-testid="internal-box">
      <h3>Internal (agents never see this)</h3>
      {data.on_hold && <p className="notice error small" data-testid="on-hold">On legal hold since {fmtTime(active?.placed_at)} — {active?.reason}</p>}
      <div className="row">
        {data.tags.map(x => <span key={x} className="tag gold" data-testid="agent-tag">{x} <button className="linkbtn" aria-label={`Remove ${x}`} disabled={busy}
          onClick={() => void act(() => api.agentTag(userId, x, false))}>×</button></span>)}
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="add a tag" style={{ width: 130, minHeight: 36 }} data-testid="tag-input"
          onKeyDown={e => { if (e.key === 'Enter' && TAG_RE.test(t)) { e.preventDefault(); void act(() => api.agentTag(userId, t, true)).then(() => setTag('')); } }} />
        <button className="btn small" disabled={busy || !TAG_RE.test(t)} onClick={() => void act(() => api.agentTag(userId, t, true)).then(() => setTag(''))} data-testid="tag-add">Add tag</button>
      </div>
      <div className="row small">
        {can(me.role, 'complaints') && <button className="linkbtn" onClick={() => go({ k: 'complaints' })}>{data.complaints} complaint{data.complaints === 1 ? '' : 's'}{data.complaints_active ? ` (${data.complaints_active} open)` : ''}</button>}
        {can(me.role, 'pdpa') && <span>· {data.pdpa} PDPA request{data.pdpa === 1 ? '' : 's'}</span>}
      </div>
      {data.licence_number && (
        <div className="row small" data-testid="licence-expiry">
          <span className={`tag ${tagLevel(expiryLevel(days))}`}>{expiryText(days, data.licence_expires_on)}</span>
          <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ width: 'auto', minHeight: 36 }} data-testid="internal-expiry" />
          <button className="btn small" disabled={!expiry} onClick={() => setC({ title: `Licence expiry for ${email}`, body: <p>{data.licence_number}: expires on <b>{expiry}</b>.</p>, label: 'Save',
            run: async reason => { await api.setLicenceExpiry(userId, expiry, reason); setExpiry(''); await load(); } })} data-testid="internal-expiry-save">Set expiry</button>
        </div>
      )}
      <label className="field"><span>Internal note (kept for good)</span><textarea rows={2} maxLength={4000} value={note} onChange={e => setNote(e.target.value)} data-testid="agent-note" /></label>
      <div className="row"><span className="spacer" /><button className="btn small gold" disabled={busy || !note.trim()} onClick={() => void act(async () => { await api.agentNote(userId, note); setNote(''); })} data-testid="agent-note-save">Save note</button></div>
      {aErr && <p className="error small" role="alert">{aErr}</p>}
      {data.notes.length > 0 && <ol className="history" data-testid="agent-notes">{data.notes.map(n => <li key={n.id}><small className="muted">{fmtTime(n.at)} · {n.by_email}</small><br />{n.body}</li>)}</ol>}
      {can(me.role, 'placeHold') && (data.on_hold
        ? <button className="btn small" onClick={() => setC({ title: 'Release the legal hold', body: <p>{email}'s records can be deleted again by later, approved steps.</p>, label: 'Release',
            run: async reason => { await api.holdRelease(active!.id, reason); await load(); } })} data-testid="internal-release">Release legal hold</button>
        : <button className="btn small danger" onClick={() => setC({ title: `Legal hold on ${email}`, body: <p>None of this agent's records can be deleted until the hold is released.</p>, label: 'Place hold', danger: true,
            run: async reason => { await api.holdPlace(userId, reason, null); await load(); } })} data-testid="internal-hold">Put on legal hold</button>)}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}
