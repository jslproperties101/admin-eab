// One case: the request, the agents it covers (with their periods), the packs built for it, and — for the Owner —
// temporary regulator access (feature 75). Every change asks for a reason and a second confirmation and is recorded
// in the Master Audit Log by the database.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AgentRow, CaseAgent, CaseFile, CaseGrant, CaseStatus, Pack } from '../api/admin';
import { can } from '../admin/roles';
import { fmtTime } from '../export/reports';
import { REQUESTER_LABEL, buildCasePack, downloadPack, shortFp } from '../export/pack';
import { CASE_STATUS_LABEL, CaseStatusTag, daysLeft } from './Cases';
import { ConfirmDialog, ErrorBox, Kv, Loading } from './ui';

type Ask =
  | { k: 'status'; status: CaseStatus; outcome: string }
  | { k: 'add'; agent: AgentRow; from: string; to: string }
  | { k: 'remove'; agent: CaseAgent }
  | { k: 'grant'; email: string; until: string }
  | { k: 'revoke'; grant: CaseGrant };

const plusDays = (n: number) => new Date(Date.now() + 8 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
export const sizeText = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const KIND_LABEL: Record<Pack['kind'], string> = { case_pack: 'Case pack', agent_profile: 'Agent profile export', pdpa_access: 'PDPA copy for the agent' };

export function CaseScreen({ id }: { id: string }) {
  const { api, me, go } = useAdmin();
  const [c, setC] = useState<CaseFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const edit = can(me.role, 'editCases');
  const owner = can(me.role, 'grantRegulator');

  const load = useCallback(async () => {
    setErr(null);
    try { setC(await api.caseGet(id)); } catch (e) { setErr(errText(e)); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!c) return <Loading text="Loading case…" />;
  const agents = (Array.isArray(c.agents) ? c.agents : []);
  const current = agents.filter(a => !a.removed_at);
  const packs = (Array.isArray(c.packs) ? c.packs : []).filter(p => p.stored);
  const closed = c.status === 'closed';
  const d = closed ? null : daysLeft(c.deadline);

  const run = async (reason: string) => {
    if (!ask) return;
    try {
      let next: CaseFile;
      if (ask.k === 'status') next = await api.caseUpdate(c.id, { status: ask.status, ...(ask.outcome.trim() ? { outcome: ask.outcome.trim() } : {}) }, reason);
      else if (ask.k === 'add') next = await api.caseAddAgent(c.id, ask.agent.user_id, ask.from || null, ask.to || null, reason);
      else if (ask.k === 'remove') next = await api.caseRemoveAgent(c.id, ask.agent.user_id, reason);
      else if (ask.k === 'grant') next = await api.caseGrant(c.id, ask.email.trim(), new Date(`${ask.until}T23:59:59+08:00`).toISOString(), reason);
      else next = await api.caseRevoke(c.id, ask.grant.admin_user, reason);
      setC(next);
      setMsg({ ok: true, text: ask.k === 'grant' ? `Access given to ${ask.email.trim()} until ${ask.until}. They sign in to Admin EAB with that Google account.` : 'Saved.' });
    } catch (e) { throw new Error(errText(e)); }
  };

  return (
    <div className="split">
      <aside className="side stack">
        <div className="card boxed stack">
          <div className="row"><h1 style={{ fontSize: '1.25rem' }} className="spacer">{c.case_no}</h1><CaseStatusTag s={c.status} /></div>
          {d !== null && <span className={`tag ${d < 0 ? 'red' : d <= 3 ? 'amber' : ''}`} style={{ alignSelf: 'flex-start' }}>{d < 0 ? `${-d} day(s) past the deadline` : `${d} day(s) to the deadline`}</span>}
          <Kv rows={[
            { k: 'Requested by', v: REQUESTER_LABEL[c.requester_type] ?? c.requester_type },
            { k: c.requester_type === 'pdpa' ? 'Agent' : 'Officer / office', v: c.requester_name },
            { k: 'Their reference', v: c.requester_ref ?? '' },
            { k: 'Contact', v: c.requester_contact ?? '' },
            { k: 'Received', v: c.received_on },
            { k: 'Deadline', v: c.deadline ?? '' },
            { k: 'Request', v: c.description },
            ...(c.outcome ? [{ k: 'Outcome', v: c.outcome }] : []),
            { k: 'Opened', v: fmtTime(c.created_at) },
            ...(c.closed_at ? [{ k: 'Closed', v: fmtTime(c.closed_at) }] : []),
          ]} />
          {edit && <StatusButtons c={c} onAsk={(status, outcome) => setAsk({ k: 'status', status, outcome })} />}
        </div>
        {edit && <PackBox c={c} onBuilt={(text, ok) => { setMsg({ ok, text }); void load(); }} />}
        {owner && !closed && <GrantBox c={c} grants={c.grants ?? []} agentsCount={current.length}
          onGrant={(email, until) => setAsk({ k: 'grant', email, until })} onRevoke={g => setAsk({ k: 'revoke', grant: g })} />}
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'error'}`} role="status" data-testid="case-msg">{msg.text}</div>}
      </aside>
      <section className="stack">
        <h2>Agents ({current.length})</h2>
        {current.length === 0 && <p className="muted">No agents on this case yet.</p>}
        <div className="list" data-testid="case-agents">
          {agents.map(a => (
            <div key={a.user_id} className={`item ${a.removed_at ? 'deleted' : ''}`}>
              <div className="row">
                <button className="linkbtn spacer" style={{ textAlign: 'left' }} onClick={() => go({ k: 'agent', id: a.user_id })}><b>{a.name || a.email}</b></button>
                {a.removed_at ? <span className="tag">Removed {fmtTime(a.removed_at)}</span>
                  : edit && !closed && <button className="btn small" onClick={() => setAsk({ k: 'remove', agent: a })} data-testid="case-remove-agent">Remove</button>}
              </div>
              <small className="muted">{a.email} · period {a.date_from ?? 'start'} to {a.date_to ?? 'today'}</small>
            </div>
          ))}
        </div>
        {edit && !closed && <AddAgent key={current.map(a => a.user_id).join(",")} onPick={(agent, from, to) => setAsk({ k: 'add', agent, from, to })} exclude={current.map(a => a.user_id)} />}
        <h2>Packs ({packs.length})</h2>
        <PackList packs={packs} />
      </section>
      {ask && (
        <ConfirmDialog
          title={ask.k === 'status' ? `Mark case ${CASE_STATUS_LABEL[ask.status].toLowerCase()}` : ask.k === 'add' ? 'Add agent to case'
            : ask.k === 'remove' ? 'Remove agent from case' : ask.k === 'grant' ? 'Give regulator access' : 'End regulator access'}
          danger={ask.k === 'remove' || ask.k === 'grant' || ask.k === 'revoke' || (ask.k === 'status' && ask.status === 'closed')}
          body={ask.k === 'status' ? <p>{c.case_no} → <b>{CASE_STATUS_LABEL[ask.status]}</b>{ask.outcome.trim() ? <>. Outcome: “{ask.outcome.trim()}”</> : null}{ask.status === 'closed' ? '. A closed case cannot get new agents or regulator access.' : ''}</p>
            : ask.k === 'add' ? <p>{ask.agent.name || ask.agent.email} ({ask.agent.email}), period {ask.from || 'start'} to {ask.to || 'today'}. Any regulator already given access to this case will see this agent too.</p>
            : ask.k === 'remove' ? <p>{ask.agent.email} is taken off {c.case_no} (kept in the record as removed). Regulator access to this agent through this case ends now.</p>
            : ask.k === 'grant' ? <p><b>{ask.email.trim()}</b> can sign in to Admin EAB until <b>{ask.until}</b> and see, read-only, the {current.length} agent(s) on {c.case_no} and the packs in this case. Everything they open is recorded.</p>
            : <p>{ask.grant.email} loses access to {c.case_no} now. If they have no other case, their login is switched off.</p>}
          confirmLabel={ask.k === 'status' ? 'Save' : ask.k === 'add' ? 'Add agent' : ask.k === 'remove' ? 'Remove' : ask.k === 'grant' ? 'Give access' : 'End access'}
          onClose={() => setAsk(null)}
          onConfirm={run}
        />
      )}
    </div>
  );
}

function StatusButtons({ c, onAsk }: { c: CaseFile; onAsk: (s: CaseStatus, outcome: string) => void }) {
  const [outcome, setOutcome] = useState(c.outcome ?? '');
  const next: CaseStatus[] = (['open', 'supplied', 'closed'] as CaseStatus[]).filter(s => s !== c.status);
  return (
    <div className="stack">
      <label className="field"><span>Outcome / what was supplied (optional)</span>
        <textarea value={outcome} maxLength={4000} onChange={e => setOutcome(e.target.value)} style={{ minHeight: 60 }} data-testid="case-outcome" /></label>
      <div className="row">{next.map(s => <button key={s} className={`btn small ${s === 'closed' ? '' : 'gold'}`} onClick={() => onAsk(s, outcome)} data-testid={`case-mark-${s}`}>Mark {CASE_STATUS_LABEL[s].toLowerCase()}</button>)}</div>
    </div>
  );
}

function PackBox({ c, onBuilt }: { c: CaseFile; onBuilt: (text: string, ok: boolean) => void }) {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const current = (Array.isArray(c.agents) ? c.agents : []).filter(a => !a.removed_at);
  const go = async (format: 'pdf' | 'xlsx') => {
    setBusy('Starting…');
    try {
      const r = await buildCasePack(api, me.email, c, format, setBusy);
      onBuilt(`${r.pack.reference}: ${r.how} · kept in the Document Vault · fingerprint ${shortFp(r.pack.sha256)}`, true);
    } catch (e) { onBuilt(errText(e), false); }
    finally { setBusy(null); }
  };
  return (
    <div className="card stack" data-testid="pack-box">
      <h3>{c.requester_type === 'pdpa' ? 'Make the agent’s data copy' : 'Build a pack for the requester'}</h3>
      <small className="muted">One file with a cover page and every agent’s complete record (listings including deleted ones, change history, sign-ins in each agent’s period, Terms answers). It gets a reference number and fingerprints and is kept in the Document Vault.</small>
      <div className="row">
        <button className="btn gold" disabled={!!busy || !current.length} onClick={() => void go('pdf')} data-testid="pack-pdf">PDF</button>
        <button className="btn gold" disabled={!!busy || !current.length} onClick={() => void go('xlsx')} data-testid="pack-xlsx">Excel</button>
      </div>
      {!current.length && <small className="muted">Add an agent first.</small>}
      {busy && <small role="status">{busy}</small>}
    </div>
  );
}

function GrantBox({ c, grants, agentsCount, onGrant, onRevoke }: { c: CaseFile; grants: CaseGrant[]; agentsCount: number;
  onGrant: (email: string, until: string) => void; onRevoke: (g: CaseGrant) => void }) {
  const [email, setEmail] = useState('');
  const [until, setUntil] = useState(plusDays(14));
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && until > plusDays(0) && until <= plusDays(90) && agentsCount > 0;
  return (
    <div className="card stack" data-testid="grant-box">
      <h3>Regulator access</h3>
      <small className="muted">Let an officer look at this case themselves, read-only, until a date (at most 90 days). They sign in to Admin EAB with their own Google account (it must have signed in once). They see only this case’s agents and packs. They cannot export, change anything, or see other staff.</small>
      {grants.map(g => (
        <div key={g.admin_user} className="row small">
          <span className="spacer">{g.email} · until {fmtTime(g.expires_at)}</span>
          {g.active ? <><span className="tag ok">Active</span><button className="btn small" onClick={() => onRevoke(g)} data-testid="grant-revoke">End now</button></> : <span className="tag">Ended</span>}
        </div>
      ))}
      <label className="field"><span>Officer’s Google email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="officer@gmail.com" data-testid="grant-email" /></label>
      <label className="field"><span>Access ends (end of day, Malaysia time)</span><input type="date" value={until} min={plusDays(1)} max={plusDays(90)} onChange={e => setUntil(e.target.value)} data-testid="grant-until" /></label>
      <button className="btn" disabled={!valid} onClick={() => onGrant(email, until)} data-testid="grant-give">Give access…</button>
      {agentsCount === 0 && <small className="muted">Add an agent to the case first.</small>}
      <small className="muted">{c.case_no}</small>
    </div>
  );
}

function AddAgent({ onPick, exclude }: { onPick: (a: AgentRow, from: string, to: string) => void; exclude: string[] }) {
  const { api } = useAdmin();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AgentRow[] | null>(null);
  const [pick, setPick] = useState<AgentRow | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const find = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setPick(null);
    if (q.trim().length < 2) return;
    try { setHits((await api.agents('all', q.trim(), 20)).filter(a => !exclude.includes(a.user_id))); } catch (x) { setErr(errText(x)); }
  };
  return (
    <div className="card stack" data-testid="add-agent">
      <h3>Add an agent</h3>
      <form className="row" onSubmit={find}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Agent name or email" style={{ flex: 1, minWidth: 180 }} data-testid="add-agent-q" />
        <button className="btn" type="submit">Find</button>
      </form>
      {err && <p className="error">{err}</p>}
      {hits && hits.length === 0 && <small className="muted">No agent found (or already on the case).</small>}
      {hits && hits.length > 0 && !pick && (
        <div className="list">{hits.map(a => <button key={a.user_id} className="item" onClick={() => setPick(a)} data-testid="add-agent-hit"><b>{a.name || a.email}</b><br /><small className="muted">{a.email}</small></button>)}</div>
      )}
      {pick && (
        <div className="stack">
          <b>{pick.name || pick.email}</b>
          <div className="row">
            <label className="field" style={{ flex: 1, minWidth: 140 }}><span>Period from (optional)</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="field" style={{ flex: 1, minWidth: 140 }}><span>to (optional)</span><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <div className="row"><button className="btn" onClick={() => setPick(null)}>Back</button><span className="spacer" />
            <button className="btn gold" disabled={!!(from && to && to < from)} onClick={() => onPick(pick, from, to)} data-testid="add-agent-go">Add…</button></div>
        </div>
      )}
    </div>
  );
}

export function PackList({ packs, showCase = false }: { packs: Pack[]; showCase?: boolean }) {
  const { api } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!packs.length) return <p className="muted" data-testid="packs-empty">No packs yet.</p>;
  const get = async (p: Pack) => {
    setBusy(p.id); setMsg(null);
    try { setMsg({ ok: true, text: `${p.reference}: ${await downloadPack(api, p)} (fingerprint checked)` }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message?.startsWith('WARNING') ? (e as Error).message : errText(e) }); }
    finally { setBusy(null); }
  };
  return (
    <div className="stack">
      <div className="tablewrap">
        <table data-testid="packs-table">
          <thead><tr><th>Made</th><th>Reference</th>{showCase && <th>Case / agent</th>}<th>What</th><th>File</th><th>Fingerprint</th><th></th></tr></thead>
          <tbody>
            {packs.map(p => (
              <tr key={p.id}>
                <td>{fmtTime(p.created_at)}{p.created_by_email ? <><br /><small className="muted">{p.created_by_email}</small></> : null}</td>
                <td className="mono">{p.reference}</td>
                {showCase && <td>{p.case_no ?? ''}{p.agent_email ? <><br /><small className="muted">{p.agent_email}</small></> : null}</td>}
                <td>{KIND_LABEL[p.kind]}</td>
                <td>{p.format.toUpperCase()} · {sizeText(p.bytes)}</td>
                <td className="mono" title={p.sha256}>{shortFp(p.sha256)}</td>
                <td><button className="btn small" disabled={busy === p.id} onClick={() => void get(p)} data-testid="pack-download">{busy === p.id ? 'Getting…' : 'Download'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'error'}`} role="status" data-testid="pack-msg">{msg.text}</div>}
    </div>
  );
}
