// All agents in one list (features 1, 45, 46, 47, 52, 53). Four views of the same list:
//   All agents        — status, licence, last sign-in, Terms version (Agents Overview, Terms Acceptance, Force Logout)
//   Login Security    — failed sign-ins, lockouts and blocked attempts in the last 30 days, worst first
//   Not active        — suspended, banned or closed accounts, newest change first
//   Licence           — agents who entered a licence number, unverified first
// Opening an agent goes to the Agent Profile, where the actions are. The list is written to the access log.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AgentFilter, AgentRow } from '../api/admin';
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
  const { api, go } = useAdmin();
  const [q, setQ] = useState('');
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
      <h1>Agents</h1>
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
            <button key={a.user_id} className="item" onClick={() => go({ k: 'agent', id: a.user_id })} data-testid="agent-row">
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
