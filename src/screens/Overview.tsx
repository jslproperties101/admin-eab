// AdminBatch006 Part C — Master Dashboard (71), Top Agents (58), Live Users Now (22).
// Master Dashboard: the key numbers and red / amber alerts from everything else, each opening the screen behind it.
// Top Agents names agents (Owner / Admin / Compliance, access-logged). Live Users: counts for everyone, names for staff.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { View, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { LiveUsers, MasterDash, TopAgent } from '../api/admin';
import { MB, daysSince, fmtBytes, levelFor, pct, todayKL } from '../admin/health';
import { RANGE_LABEL, RangeKey, fmtNum, nameLabel, presetRange } from '../admin/dash';
import { fmtTime } from '../export/reports';
import { platformLabel } from './status';
import { Bars, HBars } from './charts';
import { ErrorBox, Loading } from './ui';

export interface Alert { level: 'red' | 'amber'; text: string; open?: View }
/** Red / amber alerts from the Master Dashboard numbers (pure, unit-tested). */
export function masterAlerts(m: MasterDash, today: string): Alert[] {
  const a: Alert[] = [];
  if (m.maintenance_on) a.push({ level: 'red', text: 'Maintenance mode is ON — agents cannot use the app', open: { k: 'ops', tab: 'maintenance' } });
  const dbp = pct(m.db_bytes, m.db_limit_bytes), fp = pct(m.files_bytes, m.files_limit_bytes);
  if (levelFor(dbp) !== 'ok') a.push({ level: levelFor(dbp) as 'red' | 'amber', text: `Database ${Math.round(dbp)}% full`, open: { k: 'health', tab: 'storage' } });
  if (levelFor(fp) !== 'ok') a.push({ level: levelFor(fp) as 'red' | 'amber', text: `Stored files ${Math.round(fp)}% full`, open: { k: 'health', tab: 'storage' } });
  const since = daysSince(m.last_restore_pass, today);
  if (since === null) a.push({ level: 'red', text: 'No backup restore test has been recorded', open: { k: 'health', tab: 'backups' } });
  else if (since > 37) a.push({ level: 'amber', text: `Last passed restore test was ${since} days ago`, open: { k: 'health', tab: 'backups' } });
  if (m.aws_backup !== 'set_up') a.push({ level: 'amber', text: 'Second backup (AWS) not set up', open: { k: 'health', tab: 'backups' } });
  const fr = m.sync_runs_7d ? (m.sync_fails_7d / m.sync_runs_7d) * 100 : 0;
  if (m.sync_fails_7d && fr >= 10) a.push({ level: fr >= 25 ? 'red' : 'amber', text: `${m.sync_fails_7d} sync failures in 7 days (${Math.round(fr)}%)`, open: { k: 'health', tab: 'sync' } });
  if (m.tickets_new) a.push({ level: 'amber', text: `${m.tickets_new} new problem report${m.tickets_new === 1 ? '' : 's'}`, open: { k: 'tickets' } });
  if (m.pushes_waiting) a.push({ level: 'amber', text: `${m.pushes_waiting} push alert${m.pushes_waiting === 1 ? '' : 's'} waiting to be sent`, open: { k: 'news', tab: 'push' } });
  if (m.min_version_mode === 'hard' && m.min_version) a.push({ level: 'amber', text: `Hard block below version ${m.min_version}`, open: { k: 'ops', tab: 'release' } });
  if (m.stale) a.push({ level: 'amber', text: `${m.stale} stale listing${m.stale === 1 ? '' : 's'} (60+ days)`, open: { k: 'dash', tab: 'listings' } });
  if (m.at_risk) a.push({ level: 'amber', text: `${m.at_risk} agent${m.at_risk === 1 ? '' : 's'} at risk of leaving`, open: { k: 'dash', tab: 'retention' } });
  if (m.licences_unverified) a.push({ level: 'amber', text: `${m.licences_unverified} licence${m.licences_unverified === 1 ? '' : 's'} not verified`, open: { k: 'agents', filter: 'licence' } });
  return a.sort((x, y) => (x.level === y.level ? 0 : x.level === 'red' ? -1 : 1));
}

function Tile({ label, value, sub, open, testid }: { label: string; value: ReactNode; sub?: ReactNode; open?: View; testid?: string }) {
  const { go } = useAdmin();
  const body = <><span className="l">{label}</span><b className="v">{value}</b>{sub && <small className="muted">{sub}</small>}</>;
  return open ? <button className="stat pick" onClick={() => go(open)} data-testid={testid}>{body}</button> : <div className="stat" data-testid={testid}>{body}</div>;
}

export function MasterScreen() {
  const { api, go, me } = useAdmin();
  const [m, setM] = useState<MasterDash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setM(await api.master()); } catch (e) { setErr(errText(e)); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!m) return <Loading />;
  const today = todayKL();
  const alerts = masterAlerts(m, today);
  const staff = can(me.role, 'viewTickets');
  return (
    <div className="stack" data-testid="master">
      <div className="row"><h1 className="spacer">Master Dashboard</h1><small className="muted">Checked {fmtTime(m.checked_at)}</small><button className="btn small" onClick={() => void load()}>Refresh</button></div>
      <div className="card boxed stack" data-testid="alerts">
        <h2>{alerts.length ? `Needs attention (${alerts.length})` : 'All clear'}</h2>
        {alerts.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing needs attention right now.</p> : (
          <ul className="alerts">{alerts.map(a => (
            <li key={a.text} className={a.level}>
              {a.open && (a.open.k !== 'tickets' || staff) ? <button className="linkbtn" onClick={() => go(a.open!)}>{a.text}</button> : <span>{a.text}</span>}
            </li>))}</ul>
        )}
      </div>
      <h2>Agents</h2>
      <div className="stats">
        <Tile label="Agents" value={fmtNum(m.agents)} sub={`${m.new_7d} new in 7 days`} open={{ k: 'dash', tab: 'growth' }} testid="m-agents" />
        <Tile label="Using the app now" value={fmtNum(m.live_now)} sub="last 5 minutes" open={{ k: 'live' }} testid="m-live" />
        <Tile label="Active today" value={fmtNum(m.active_today)} sub={`${m.active_7d} in 7 days · ${m.active_30d} in 30`} open={{ k: 'dash', tab: 'active' }} />
        <Tile label="At risk" value={fmtNum(m.at_risk)} open={{ k: 'dash', tab: 'retention' }} />
        <Tile label="Accounts not active" value={fmtNum(m.accounts_not_active)} sub="suspended / banned / closed" open={can(me.role, 'listAgents') ? { k: 'agents', filter: 'not_active' } : undefined} />
      </div>
      <div className="card"><Bars label="Agents who used the app, last 14 days" items={m.active_by_day.map(d => ({ label: d.day, value: d.agents }))} /></div>
      <h2>Business</h2>
      <div className="stats">
        <Tile label="Listings" value={fmtNum(m.listings)} sub={`${m.stale} stale`} open={{ k: 'dash', tab: 'listings' }} />
        <Tile label="Sold or rented, 30 days" value={fmtNum(m.closed_30d)} open={can(me.role, 'viewDashAgents') ? { k: 'top' } : { k: 'dash', tab: 'pipeline' }} />
        <Tile label="Posts live" value={fmtNum(m.posts_live)} sub={`${m.pushes_waiting} push alert(s) waiting`} open={{ k: 'news', tab: 'news' }} />
      </div>
      <h2>System</h2>
      <div className="stats">
        <Tile label="Database" value={fmtBytes(m.db_bytes)} sub={`of ${fmtBytes(m.db_limit_bytes)}`} open={{ k: 'health', tab: 'storage' }} />
        <Tile label="Stored files" value={fmtBytes(m.files_bytes)} sub={`of ${fmtBytes(m.files_limit_bytes)}`} open={{ k: 'health', tab: 'storage' }} />
        <Tile label="Last restore test passed" value={m.last_restore_pass ?? 'never'} open={{ k: 'health', tab: 'backups' }} />
        <Tile label="Sync, 7 days" value={`${fmtNum(m.sync_fails_7d)} failed`} sub={`of ${fmtNum(m.sync_runs_7d)} runs`} open={can(me.role, 'viewHealthAgents') ? { k: 'health', tab: 'sync' } : undefined} />
        <Tile label="Problem reports open" value={fmtNum(m.tickets_open)} sub={`${m.tickets_new} new`} open={staff ? { k: 'tickets' } : undefined} testid="m-tickets" />
        <Tile label="Maintenance" value={m.maintenance_on ? 'ON' : 'off'} open={{ k: 'ops', tab: 'maintenance' }} />
        <Tile label="Minimum version" value={m.min_version ?? 'none'} sub={m.min_version ? (m.min_version_mode === 'hard' ? 'hard block' : 'soft warning') : undefined} open={{ k: 'ops', tab: 'release' }} />
        <Tile label="Feature flags on" value={fmtNum(m.flags_on)} open={{ k: 'ops', tab: 'flags' }} />
      </div>
      <small className="muted">Storage limits are the ones set in System Health (MB {Math.round(m.db_limit_bytes / MB)} / {Math.round(m.files_limit_bytes / MB)}).</small>
    </div>
  );
}

export function TopAgentsScreen() {
  const { api, go } = useAdmin();
  const [key, setKey] = useState<Exclude<RangeKey, 'custom'>>('30');
  const [data, setData] = useState<TopAgent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true; setData(null); setErr(null);
    const r = presetRange(key, todayKL());
    api.topAgents(r.from, r.to, 50).then(x => on && setData(x.agents)).catch(e => on && setErr(errText(e)));
    return () => { on = false; };
  }, [api, key]);
  return (
    <div className="stack" data-testid="top">
      <h1>Top agents</h1>
      <div className="tabs" role="group" aria-label="Period" style={{ margin: 0 }}>
        {(['7', '30', '90', '365'] as const).map(k => <button key={k} aria-pressed={key === k} onClick={() => setKey(k)} data-testid={`top-${k}`}>{RANGE_LABEL[k]}</button>)}
      </div>
      <p className="muted small" style={{ margin: 0 }}>Ranked by listings sold or rented in the period, then new listings, then days they used the app. Opening this list is recorded.</p>
      {err ? <ErrorBox text={err} /> : !data ? <Loading /> : data.length === 0 ? <p className="muted">No activity in this period.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="top-list">
            <thead><tr><th>#</th><th>Agent</th><th>Sold</th><th>Rented</th><th>New listings</th><th>Listings now</th><th>Days used</th><th>Actions</th></tr></thead>
            <tbody>{data.map((t, i) => (
              <tr key={t.user_id}><td>{i + 1}</td>
                <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: t.user_id })}>{t.name ?? t.email}</button><br /><small className="muted">{t.email}</small></td>
                <td>{t.sold}</td><td>{t.rented}</td><td>{t.new_listings}</td><td>{t.listings}</td><td>{t.active_days}</td><td>{fmtNum(t.actions)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LiveScreen() {
  const { api, me, go } = useAdmin();
  const [mins, setMins] = useState(5);
  const [d, setD] = useState<LiveUsers | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setD(await api.liveUsers(mins)); } catch (e) { setErr(errText(e)); } }, [api, mins]);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(t); }, [load]);
  return (
    <div className="stack" data-testid="live">
      <div className="row"><h1 className="spacer">Live users now</h1><button className="btn small" onClick={() => void load()}>Refresh</button></div>
      <div className="tabs" role="group" aria-label="Within" style={{ margin: 0 }}>
        {[5, 15, 60].map(m => <button key={m} aria-pressed={mins === m} onClick={() => setMins(m)} data-testid={`live-${m}`}>Last {m} min</button>)}
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !d ? <Loading /> : (
        <>
          <div className="stats"><div className="stat"><span className="l">Agents using the app</span><b className="v" data-testid="live-count">{d.count}</b><small className="muted">in the last {d.minutes} minutes · updates every minute</small></div></div>
          <div className="card stack"><h3>On which screen</h3>
            <HBars label="Agents per screen" items={d.by_screen.map(s => ({ key: s.screen, label: s.screen === 'unknown' ? 'No screen yet' : nameLabel(s.screen), value: s.agents }))} /></div>
          {d.agents === null || !can(me.role, 'viewDashAgents') ? <p className="muted small">Names are shown to the Owner, Admin and Compliance only.</p> : d.agents.length > 0 && (
            <div className="tablewrap dash-table"><table data-testid="live-list">
              <thead><tr><th>Agent</th><th>Screen</th><th>Last action</th><th>App</th></tr></thead>
              <tbody>{d.agents.map(a => <tr key={a.user_id}>
                <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: a.user_id })}>{a.name ?? a.email}</button></td>
                <td>{a.screen ? nameLabel(a.screen) : '—'}</td><td className="small">{fmtTime(a.last_at)}</td>
                <td className="small">{a.app_version ?? '—'} · {platformLabel(a.platform)}{a.device ? ` · ${a.device}` : ''}</td></tr>)}</tbody>
            </table></div>
          )}
          <small className="muted">“Using now” = the app sent something (a screen, a sync, a heartbeat) in the last {d.minutes} minutes.</small>
        </>
      )}
    </div>
  );
}
