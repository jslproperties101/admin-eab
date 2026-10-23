// AdminBatch009 — Agent insight (features 92, 93, 97, 98; bulk actions 95 live in the Agents list).
//   Scorecard     one score out of 100 per agent: Listings 40 + Activity 30 + Compliance 30, lowest first, with the reasons.
//                 A Viewer sees only how the scores are spread (no names).
//   Funnel        signed up → opened → Terms → licence → verified → first listing → first deal, for a sign-up period.
//                 Owner / Admin / Compliance can open "who is stuck" at each step.
//   Duplicates    accounts that share a phone number, a phone (device) or a licence number.
//   Agent Profile a score card, and a Devices tab (every phone used; Owner / Admin can remove one = sign it out).
// Lists that name agents are written to the access log by the database.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { AgentDevice, AgentScore, DuplicateGroup, Funnel, Scorecard, StuckAgent } from '../api/admin';
import { DUP_LABEL, SCORE_PARTS, deviceState, funnelRows, scoreLevel } from '../admin/insight';
import { Range, presetRange } from '../admin/dash';
import { todayKL } from '../admin/health';
import { fmtTime } from '../export/reports';
import { platformLabel, StatusTag } from './status';
import { RangePicker } from './Dashboards';
import { HBars } from './charts';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => { setErr(null); setData(null); try { setData(await fn()); } catch (e) { setErr(errText(e)); } }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}
const ScoreTag = ({ s }: { s: number }) => <span className={`tag ${scoreLevel(s)}`} data-testid="score">{s}</span>;

// =====================================================================================================
// Scorecard (92)
// =====================================================================================================
export function ScorecardScreen() {
  const { api, go } = useAdmin();
  const { data, err, load } = useLoad<Scorecard>(() => api.scorecard(500), [api]);
  const [q, setQ] = useState('');
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const list = (data.agents ?? []).filter(a => !q.trim() || `${a.name ?? ''} ${a.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="stack" data-testid="scorecard">
      <h1>Agent scorecard</h1>
      <p className="muted small" style={{ margin: 0 }}>
        One score out of 100. {SCORE_PARTS.map(p => `${p.label} ${p.max}: ${p.help.toLowerCase()}.`).join(' ')}
      </p>
      <div className="stats">
        <div className="stat"><span className="v">{data.agents_count}</span><span className="l">agents</span></div>
        <div className="stat"><span className="v">{data.average ?? '—'}</span><span className="l">average score</span></div>
        {SCORE_PARTS.map(p => <div key={p.key} className="stat"><span className="v">{(data.parts_average as Record<string, number | null>)[p.key.slice(2)] ?? '—'} / {p.max}</span><span className="l">average {p.label.toLowerCase()}</span></div>)}
      </div>
      <HBars items={data.bands.map(b => ({ key: b.band, label: `Score ${b.band}`, value: b.agents }))} label="How the scores are spread (agents)" testid="score-bands" />
      {data.names_hidden ? (
        <p className="notice small" data-testid="names-hidden">Your role sees how the scores are spread only. The list of agents is shown to the Owner, Admin and Compliance.</p>
      ) : (
        <>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find an agent" aria-label="Find an agent" data-testid="score-q" />
          <div className="tablewrap dash-table"><table data-testid="score-list">
            <thead><tr><th>Agent</th><th>Score</th><th>Listings</th><th>Activity</th><th>Compliance</th><th>What pulls it down</th></tr></thead>
            <tbody>{list.map(a => (
              <tr key={a.user_id}>
                <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: a.user_id })} data-testid="score-agent">{a.name ?? a.email}</button>
                  {a.status !== 'active' && <> <StatusTag status={a.status} /></>}<br /><small className="muted">{a.email}</small></td>
                <td><ScoreTag s={a.score} /></td>
                <td>{a.p_listings}/40<br /><small className="muted">{a.listings} listing{a.listings === 1 ? '' : 's'}</small></td>
                <td>{a.p_activity}/30<br /><small className="muted">{a.active_days} day{a.active_days === 1 ? '' : 's'}</small></td>
                <td>{a.p_compliance}/30</td>
                <td className="small">{a.reasons.length ? a.reasons.join('; ') : <span className="muted">nothing — full marks</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

/** The score card on the Agent Profile (Owner / Admin / Compliance). */
export function AgentScoreBox({ userId }: { userId: string }) {
  const { api, go } = useAdmin();
  const { data, err } = useLoad<AgentScore>(() => api.agentScore(userId), [api, userId]);
  if (err) return <div className="card boxed small error">{err}</div>;
  if (!data) return null;
  return (
    <div className="card boxed stack" data-testid="agent-score">
      <div className="row"><h3 className="spacer" style={{ margin: 0 }}>Scorecard</h3><ScoreTag s={data.score} />
        <button className="btn small" onClick={() => go({ k: 'scorecard' })}>All agents</button></div>
      <div className="row small" style={{ gap: 14 }}>
        {SCORE_PARTS.map(p => <span key={p.key} title={p.help}>{p.label} <b>{(data as unknown as Record<string, number>)[p.key]}</b>/{p.max}</span>)}
      </div>
      {data.reasons.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 18 }} data-testid="score-reasons">{data.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    </div>
  );
}

// =====================================================================================================
// Onboarding funnel (93)
// =====================================================================================================
export function FunnelScreen() {
  const { api, me, go } = useAdmin();
  const names = can(me.role, 'viewDashAgents');
  const [range, setRange] = useState<Range>(() => presetRange('90', todayKL()));
  const { data, err, load } = useLoad<Funnel>(() => api.funnel(range.from, range.to), [api, range.from, range.to]);
  const [open, setOpen] = useState<number | null>(null);
  const [stuck, setStuck] = useState<StuckAgent[] | null>(null);
  const [stuckErr, setStuckErr] = useState<string | null>(null);
  const showStuck = async (step: number) => {
    setOpen(step); setStuck(null); setStuckErr(null);
    try { setStuck(await api.funnelStuck(range.from, range.to, step)); } catch (e) { setStuckErr(errText(e)); }
  };
  useEffect(() => { setOpen(null); setStuck(null); }, [range.from, range.to]);
  const rows = data ? funnelRows(data) : [];
  return (
    <div className="stack" data-testid="funnel">
      <h1>Onboarding funnel</h1>
      <p className="muted small" style={{ margin: 0 }}>Agents who signed up in the period, and how far each one has got since. Each step counts agents who have done it, whenever they did it.</p>
      <RangePicker range={range} onChange={setRange} />
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : (
        <>
          <HBars items={rows.map(r => ({ key: String(r.step), label: `${r.step}. ${r.label}`, value: r.agents, sub: r.ofPrev === null ? undefined : `${r.ofPrev}% of the step before` }))}
            label="Agents at each step" testid="funnel-bars" onPick={names ? k => { if (k !== '1') void showStuck(Number(k)); } : undefined} />
          <div className="tablewrap dash-table"><table data-testid="funnel-table">
            <thead><tr><th>Step</th><th>Agents</th><th>Of all who signed up</th><th>Of the step before</th><th>Stopped here</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.step}>
                <td>{r.step}. {r.label}</td><td>{r.agents}</td><td>{r.ofAll === null ? '—' : `${r.ofAll}%`}</td>
                <td>{r.ofPrev === null ? '' : `${r.ofPrev}%`}</td>
                <td>{r.step === 1 ? '' : names && r.lost > 0
                  ? <button className="linkbtn" onClick={() => void showStuck(r.step)} data-testid={`stuck-${r.step}`}>{r.lost} — who?</button> : r.lost}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!names && <p className="notice small" data-testid="names-hidden">Your role sees the counts only. Who is stuck at a step is shown to the Owner, Admin and Compliance.</p>}
        </>
      )}
      {open !== null && (
        <div className="card boxed stack" data-testid="stuck-list">
          <div className="row"><h3 className="spacer" style={{ margin: 0 }}>Stuck before “{funnelRows(data!).find(r => r.step === open)?.label}”</h3>
            <button className="btn small" onClick={() => setOpen(null)}>Close</button></div>
          {stuckErr ? <p className="error">{stuckErr}</p> : !stuck ? <Loading /> : stuck.length === 0 ? <p className="muted">Nobody.</p> : stuck.map(a => (
            <button key={a.user_id} className="item" onClick={() => go({ k: 'agent', id: a.user_id })} data-testid="stuck-agent">
              <span className="row"><b className="spacer">{a.name ?? a.email}</b><small className="muted">joined {a.joined} · {a.days_since_joined} days ago</small></span>
              <small className="muted">{a.email}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================================================
// Duplicate accounts (97)
// =====================================================================================================
export function DuplicatesScreen() {
  const { api, go } = useAdmin();
  const { data, err, load } = useLoad<DuplicateGroup[]>(() => api.duplicates(), [api]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const kinds: DuplicateGroup['kind'][] = ['phone', 'device', 'licence'];
  return (
    <div className="stack" data-testid="duplicates">
      <h1>Duplicate accounts</h1>
      <p className="muted small" style={{ margin: 0 }}>Accounts that share a phone number (Agent Profile contact number), a phone (the same device signed in to both) or a licence number.
        A shared phone can be innocent (a family phone, a shop’s test phone); a shared licence number usually is not. Opening this list is recorded.</p>
      {data.length === 0 && <p className="muted" data-testid="dup-none">No shared phone numbers, phones or licence numbers found.</p>}
      {kinds.map(k => {
        const gs = data.filter(g => g.kind === k);
        if (!gs.length) return null;
        return (
          <section key={k} className="stack">
            <h2>{DUP_LABEL[k]} <small className="muted">({gs.length})</small></h2>
            {gs.map((g, i) => (
              <div key={`${k}-${i}`} className="card boxed stack" data-testid={`dup-${k}`}>
                <b className="mono">{g.value}</b>
                {g.agents.map(a => (
                  <button key={a.user_id} className="item" onClick={() => go({ k: 'agent', id: a.user_id })} data-testid="dup-agent">
                    <span className="row"><b className="spacer">{a.name ?? a.email}</b><StatusTag status={a.status} /></span>
                    <small className="muted">{a.email} · joined {a.joined}</small>
                  </button>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// =====================================================================================================
// Devices per agent (98) — a tab on the Agent Profile
// =====================================================================================================
export function DevicesTab({ agent }: { agent: string }) {
  const { api, me } = useAdmin();
  const { data, err, load } = useLoad<AgentDevice[]>(() => api.agentDevices(agent), [api, agent]);
  const [remove, setRemove] = useState<AgentDevice | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  if (data.length === 0) return <p className="muted">No phone has signed in yet.</p>;
  return (
    <div className="stack" data-testid="devices">
      <p className="muted small" style={{ margin: 0 }}>Every phone this agent has used, from the sign-in history. “Remove” signs that one phone out at its next open or sync;
        the agent can sign in on it again (it then shows here). To stop the agent completely, suspend the account instead.</p>
      {data.map(d => {
        const st = deviceState(d);
        return (
          <div key={d.device_id} className="card boxed stack" data-testid="device">
            <div className="row"><b className="spacer">{d.device ?? 'Unknown phone'} · {platformLabel(d.platform)}{d.app_version ? ` · v${d.app_version}` : ''}</b>
              {st.level ? <span className={`tag ${st.level}`} data-testid="device-state">{st.text}</span> : <span className="tag ok" data-testid="device-state">{st.text}</span>}</div>
            <small className="muted">First seen {fmtTime(d.first_seen)} · last seen {fmtTime(d.last_seen)} · {d.sign_ins} sign-in{d.sign_ins === 1 ? '' : 's'}, {d.opens} open{d.opens === 1 ? '' : 's'}
              {d.failed ? ` · ${d.failed} failed / locked` : ''}{d.last_lat !== null && d.last_lng !== null ? ` · last place ${d.last_lat.toFixed(3)}, ${d.last_lng.toFixed(3)}` : ''}</small>
            {d.removed && <small>Removed {fmtTime(d.removed.at)} by {d.removed.by ?? '—'}: {d.removed.reason}</small>}
            <small className="muted mono">Phone ID {d.device_id}</small>
            {can(me.role, 'removeDevice') && !(d.removed && !d.signed_in_after_removal) && (
              <div className="row"><span className="spacer" /><button className="btn small danger" onClick={() => setRemove(d)} data-testid="device-remove">Remove this phone</button></div>
            )}
          </div>
        );
      })}
      {remove && <ConfirmDialog title="Remove this phone" danger confirmLabel="Remove the phone"
        body={<p>{remove.device ?? 'This phone'} ({platformLabel(remove.platform)}) will be signed out at its next open or sync. Nothing on the phone is deleted.</p> as ReactNode}
        onClose={() => setRemove(null)} onConfirm={async reason => { await api.deviceRemove(agent, remove.device_id, reason); await load(); }} />}
    </div>
  );
}
