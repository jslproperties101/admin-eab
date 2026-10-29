// AdminBatch005 — Dashboards (features 6, 7, 20, 23, 24, 25, 26, 27, 29, 59, 62), one screen with tabs and one date filter.
//   Growth      sign-ups per day / week / month and the running total
//   Active      daily / weekly / monthly active agents, stickiness
//   Retention   still using 7 / 30 / 90 days after joining; agents at risk of leaving
//   Inactive    no activity for 30 / 60 / 90 days
//   Versions    app versions, phones and platforms, language
//   Listings    listings by status (each Booked stage), purpose, type, state; stale listings
//   Pipeline    sale lane and rent lane
//   Usage       most-used and not-used screens and features, day x hour heatmap, the events behind each line
// Viewer sees totals and charts only; the lists that name agents are for Owner / Admin / Compliance and are written to the
// access log by the database. Exports (Owner / Compliance) cover every tab for the chosen period.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { DashTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { DashActive, DashDevices, DashEvents, DashGrowth, DashInactive, DashListings, DashRetention, DashUsage } from '../api/admin';
import { todayKL } from '../admin/health';
import {
  AT_RISK_REASON, BUCKET_LABEL, PIPELINE_LABEL, PURPOSE_LABEL, RANGE_LABEL, Range, RangeKey, bucketFor, bucketLabel, cmpVersionDesc,
  fmtNum, fmtPct0, kindLabel, languageLabel, nameLabel, presetRange, rangeDays, rangeProblem, sortStatuses, statusLabel,
} from '../admin/dash';
import { exportDashboards } from '../export/dash';
import { fmtTime } from '../export/reports';
import { platformLabel, STATUS_LABEL } from './status';
import { Bars, HBars, Heatmap, Lines } from './charts';
import { ErrorBox, Loading } from './ui';

const TABS: { k: DashTab; label: string }[] = [
  { k: 'growth', label: 'Sign-ups' }, { k: 'active', label: 'Active users' }, { k: 'retention', label: 'Retention' },
  { k: 'inactive', label: 'Inactive' }, { k: 'versions', label: 'Versions & phones' }, { k: 'listings', label: 'Listings' },
  { k: 'pipeline', label: 'Pipeline' }, { k: 'usage', label: 'Feature usage' },
];
/** Tabs that do not use the date filter. */
const NO_RANGE: DashTab[] = ['inactive', 'pipeline'];

export function DashboardsScreen({ tab: first }: { tab: DashTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<DashTab>(first);
  const [range, setRange] = useState<Range>(() => presetRange(first === 'retention' || first === 'listings' ? '365' : '30', todayKL()));
  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">Dashboards</h1>
        {can(me.role, 'export') && <DashExport range={range} />}
      </div>
      <div className="tabs" role="group" aria-label="Dashboards">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`dtab-${t.k}`}>{t.label}</button>)}
      </div>
      {!NO_RANGE.includes(tab) && <RangePicker range={range} onChange={setRange} />}
      {tab === 'growth' && <GrowthTab range={range} />}
      {tab === 'active' && <ActiveTab range={range} />}
      {tab === 'retention' && <RetentionTab range={range} />}
      {tab === 'inactive' && <InactiveTab />}
      {tab === 'versions' && <VersionsTab range={range} />}
      {tab === 'listings' && <ListingsTab range={range} />}
      {tab === 'pipeline' && <PipelineTab />}
      {tab === 'usage' && <UsageTab range={range} />}
      {!can(me.role, 'viewDashAgents') && (
        <p className="notice small" data-testid="names-hidden">Your role sees totals and charts only. Lists that name agents are shown to the Owner, Admin and Compliance only.</p>
      )}
    </div>
  );
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setData(await fn()); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, busy, load };
}

export function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const today = todayKL();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [custom, setCustom] = useState(range.key === 'custom');
  const problem = custom ? rangeProblem(from, to, today) : null;
  return (
    <div className="card rangebar stack" data-testid="range">
      <div className="tabs" role="group" aria-label="Period" style={{ margin: 0 }}>
        {(['7', '30', '90', '365'] as Exclude<RangeKey, 'custom'>[]).map(k => (
          <button key={k} aria-pressed={!custom && range.key === k} data-testid={`range-${k}`}
            onClick={() => { setCustom(false); const r = presetRange(k, today); setFrom(r.from); setTo(r.to); onChange(r); }}>{RANGE_LABEL[k]}</button>
        ))}
        <button aria-pressed={custom} onClick={() => setCustom(true)} data-testid="range-custom">Custom</button>
      </div>
      {custom && (
        <div className="row wrap">
          <label className="field inline"><span>From</span><input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)} data-testid="range-from" /></label>
          <label className="field inline"><span>To</span><input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} data-testid="range-to" /></label>
          <button className="btn small gold" disabled={!!problem} onClick={() => onChange({ key: 'custom', from, to })} data-testid="range-apply">Show</button>
          {problem && <small className="error">{problem}</small>}
        </div>
      )}
      <small className="muted" data-testid="range-text">{range.from} to {range.to} · {rangeDays(range)} days · Malaysia dates</small>
    </div>
  );
}

export function Head({ title, onRefresh, busy, children }: { title: string; onRefresh: () => void; busy: boolean; children?: ReactNode }) {
  return (
    <div className="row">
      <h2 className="spacer">{title}</h2>
      {children}
      <button className="btn small" onClick={onRefresh} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
    </div>
  );
}
export function Stat({ label, value, sub, level }: { label: string; value: ReactNode; sub?: ReactNode; level?: 'ok' | 'amber' | 'red' }) {
  return <div className={`stat ${level ?? ''}`}><span className="l">{label}</span><b className="v">{value}</b>{sub && <small className="muted">{sub}</small>}</div>;
}
export function AgentLink({ id, email, name }: { id: string; email: string | null; name: string | null }) {
  const { go, me } = useAdmin();
  const text = name ? `${name}` : email ?? id;
  if (!can(me.role, 'viewAgent')) return <span>{text}</span>;
  return <button className="linkbtn" onClick={() => go({ k: 'agent', id })} title={email ?? undefined}>{text}</button>;
}
export const Hidden = ({ what }: { what: string }) => <p className="muted small">{what} shown to the Owner, Admin and Compliance only.</p>;

// ---------------------------------------------------------------- Sign-ups & Growth (23)
function GrowthTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const bucket = bucketFor(rangeDays(range));
  const { data: g, err, busy, load } = useLoad<DashGrowth>(() => api.dashGrowth(range.from, range.to, bucket), [api, range.from, range.to, bucket]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!g) return <Loading />;
  return (
    <div className="stack" data-testid="dash-growth">
      <Head title="Sign-ups & growth" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Agents now" value={fmtNum(g.total)} sub={`at ${g.to}`} />
        <Stat label="New in this period" value={fmtNum(g.new)} sub={g.before ? `+${fmtPct0((g.new / g.before) * 100)} on ${fmtNum(g.before)} before` : 'first agents'} />
        <Stat label={`Average new ${BUCKET_LABEL[g.bucket]}`} value={fmtNum(g.buckets.length ? g.new / g.buckets.length : 0, 1)} />
      </div>
      <div className="card stack">
        <h3>New agents {BUCKET_LABEL[g.bucket]}</h3>
        <Bars testid="growth-bars" label={`New agents ${BUCKET_LABEL[g.bucket]}`} items={g.buckets.map(b => ({ label: bucketLabel(b.start, g.bucket), value: b.new }))} />
      </div>
      <div className="card stack">
        <h3>Total agents</h3>
        <Lines label="Running total of agents" labels={g.buckets.map(b => bucketLabel(b.start, g.bucket))} series={[{ name: 'Total agents', values: g.buckets.map(b => b.running), cls: 'l1' }]} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Active Users (24)
function ActiveTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const { data: a, err, busy, load } = useLoad<DashActive>(() => api.dashActive(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!a) return <Loading />;
  const st = a.stickiness_pct;
  return (
    <div className="stack" data-testid="dash-active">
      <Head title="Active users" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label={`Daily active (${a.last?.day ?? '—'})`} value={fmtNum(a.last?.dau)} sub={`average ${fmtNum(a.avg_dau, 1)}`} />
        <Stat label="Weekly active" value={fmtNum(a.last?.wau)} sub={`average ${fmtNum(a.avg_wau, 1)}`} />
        <Stat label="Monthly active" value={fmtNum(a.last?.mau)} sub={`average ${fmtNum(a.avg_mau, 1)}`} />
        <Stat label="Stickiness" value={fmtPct0(st)} sub="daily ÷ monthly; 20%+ is good" level={st === null ? undefined : st >= 20 ? 'ok' : st >= 10 ? 'amber' : 'red'} />
        <Stat label="Used the app in this period" value={`${fmtNum(a.active_in_range)} of ${fmtNum(a.agents)}`} sub={a.agents ? `${fmtPct0((a.active_in_range / a.agents) * 100)} of all agents` : undefined} />
      </div>
      <div className="card stack">
        <h3>Active agents by day</h3>
        <Lines testid="active-lines" label="Daily, weekly and monthly active agents" labels={a.by_day.map(d => d.day)} series={[
          { name: 'Monthly (30 days)', values: a.by_day.map(d => d.mau), cls: 'l3' },
          { name: 'Weekly (7 days)', values: a.by_day.map(d => d.wau), cls: 'l2' },
          { name: 'Daily', values: a.by_day.map(d => d.dau), cls: 'l1' },
        ]} />
        <small className="muted">An agent counts as active on a day when they opened the app that day. Weekly and monthly are the 7 and 30 days up to each day.</small>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Retention & Churn (25)
function RetentionTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: r, err, busy, load } = useLoad<DashRetention>(() => api.dashRetention(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!r) return <Loading />;
  return (
    <div className="stack" data-testid="dash-retention">
      <Head title="Retention & churn" onRefresh={() => void load()} busy={busy} />
      <p className="muted small" style={{ margin: 0 }}>Of the {fmtNum(r.joined)} agents who joined in this period, how many still used the app at least 7, 30 and 90 days after joining.</p>
      <div className="stats">
        {r.retention.map(k => (
          <Stat key={k.days} label={`Still using after ${k.days} days`} value={k.eligible ? fmtPct0(k.pct) : '—'}
            sub={k.eligible ? `${k.kept} of ${k.eligible} agents` : 'nobody joined long enough ago'}
            level={!k.eligible || k.pct === null ? undefined : k.pct >= 50 ? 'ok' : k.pct >= 25 ? 'amber' : 'red'} />
        ))}
        <Stat label="At risk of leaving" value={fmtNum(r.at_risk.count)} sub="see the list below" level={r.at_risk.count ? 'amber' : 'ok'} />
      </div>
      {r.cohorts.length > 0 && (
        <div className="tablewrap dash-table">
          <table data-testid="cohorts">
            <thead><tr><th>Joined in</th><th>Agents</th><th>After 7 days</th><th>After 30 days</th><th>After 90 days</th></tr></thead>
            <tbody>{r.cohorts.map(c => (
              <tr key={c.month}><td>{c.month.slice(0, 7)}</td><td>{c.joined}</td>
                {([[c.kept7, c.eligible7], [c.kept30, c.eligible30], [c.kept90, c.eligible90]] as const).map(([k, e], i) =>
                  <td key={i}>{e ? <>{fmtPct0((k / e) * 100)} <small className="muted">({k}/{e})</small></> : <span className="muted">—</span>}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h3>At-risk agents</h3>
      <p className="muted small" style={{ margin: 0 }}>Used the app in the last 90 days but nothing for 14+ days, or used it on less than half as many days in the last 30 days as in the 30 days before.</p>
      {r.at_risk.agents === null || !can(me.role, 'viewDashAgents') ? <Hidden what="The list of agents is" /> : r.at_risk.agents.length === 0 ? <p className="muted">Nobody is at risk right now.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="at-risk">
            <thead><tr><th>Agent</th><th>Last used</th><th>Days since</th><th>Days used (last 30 / 30 before)</th><th>Why</th></tr></thead>
            <tbody>{r.at_risk.agents.map(k => (
              <tr key={k.user_id}><td><AgentLink id={k.user_id} email={k.email} name={k.name} /><br /><small className="muted">{k.email}</small></td>
                <td>{k.last_day}</td><td>{k.days_since}</td><td>{k.recent_days} / {k.prior_days}</td><td>{AT_RISK_REASON[k.reason] ?? k.reason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Inactive Agents (26)
function InactiveTab() {
  const { api, me } = useAdmin();
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const { data: i, err, busy, load } = useLoad<DashInactive>(() => api.dashInactive(days), [api, days]);
  return (
    <div className="stack" data-testid="dash-inactive">
      <Head title="Inactive agents" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="No activity for" style={{ margin: 0 }}>
          {([30, 60, 90] as const).map(d => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)} data-testid={`inactive-${d}`}>{d}+ days</button>)}
        </div>
      </Head>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !i ? <Loading /> : (
        <>
          <div className="stats">
            {(['30', '60', '90'] as const).map(k => <Stat key={k} label={`No activity ${k}+ days`} value={fmtNum(i.counts[k])} sub={`of ${fmtNum(i.agents)} agents`} level={i.counts[k] ? 'amber' : 'ok'} />)}
            <Stat label="Never opened the app" value={fmtNum(i.never_opened)} sub="signed up only" />
          </div>
          <small className="muted">Last seen = the latest day the agent opened the app or signed in with Google. A reminder message is not part of this batch.</small>
          {i.list === null || !can(me.role, 'viewDashAgents') ? <Hidden what="The list of agents is" /> : i.list.length === 0 ? <p className="muted">Nobody has been inactive for {days}+ days.</p> : (
            <div className="tablewrap dash-table">
              <table data-testid="inactive-list">
                <thead><tr><th>Agent</th><th>Last seen</th><th>Days</th><th>Joined</th><th>App</th><th>Account</th></tr></thead>
                <tbody>{i.list.map(k => (
                  <tr key={k.user_id}>
                    <td><AgentLink id={k.user_id} email={k.email} name={k.name} /><br /><small className="muted">{k.email}</small></td>
                    <td>{k.last_seen ?? <span className="muted">never</span>}</td><td>{k.days_since}</td><td>{k.joined}</td>
                    <td className="small">{k.app_version ?? '—'} {k.platform ? `· ${platformLabel(k.platform)}` : ''}</td>
                    <td>{k.status && k.status !== 'active' ? <span className="tag red">{STATUS_LABEL[k.status] ?? k.status}</span> : <span className="tag ok">Active</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Versions (20), phones (27), language (29)
function VersionsTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: d, err, busy, load } = useLoad<DashDevices>(() => api.dashDevices(range.from, range.to), [api, range.from, range.to]);
  const [pick, setPick] = useState<string | null>(null);
  const [list, setList] = useState<DashDevices['version_agents']>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const names = can(me.role, 'viewDashAgents');
  const open = async (v: string) => {
    setPick(v); setList(null); setListErr(null);
    try { setList((await api.dashDevices(range.from, range.to, v)).version_agents); } catch (e) { setListErr(errText(e)); }
  };
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!d) return <Loading />;
  const versions = [...d.versions].sort((a, b) => cmpVersionDesc(a.app_version, b.app_version));
  return (
    <div className="stack" data-testid="dash-versions">
      <Head title="App versions, phones and language" onRefresh={() => void load()} busy={busy} />
      <p className="muted small" style={{ margin: 0 }}>{fmtNum(d.agents)} agents used the app in this period. Each is counted once, by the last app they used.</p>
      <div className="grid2">
        <div className="card stack">
          <h3>App versions (newest first)</h3>
          <HBars testid="versions" label="Agents per app version" onPick={names ? v => void open(v) : undefined}
            items={versions.map(v => ({ key: v.app_version, label: v.app_version, value: v.agents, sub: `last ${fmtTime(v.last_seen)}` }))} />
          {names && <small className="muted">Tap a version to see its agents.</small>}
        </div>
        <div className="card stack">
          <h3>Platform</h3>
          <HBars testid="platforms" label="Agents per platform" items={d.platforms.map(p => ({ key: p.platform, label: platformLabel(p.platform), value: p.agents }))} />
          <h3>Language</h3>
          <HBars testid="languages" label="Agents per language" items={d.languages.map(l => ({ key: l.language, label: languageLabel(l.language), value: l.agents }))} />
        </div>
      </div>
      {pick && (
        <div className="card stack" data-testid="version-agents">
          <div className="row"><h3 className="spacer">Agents on version {pick}</h3><button className="btn small" onClick={() => setPick(null)}>Close</button></div>
          {listErr ? <ErrorBox text={listErr} /> : !list ? <Loading /> : (
            <div className="tablewrap dash-table"><table>
              <thead><tr><th>Agent</th><th>Phone</th><th>Last seen</th></tr></thead>
              <tbody>{list.map(a => <tr key={a.user_id}><td><AgentLink id={a.user_id} email={a.email} name={a.name} /><br /><small className="muted">{a.email}</small></td>
                <td>{a.device} · {platformLabel(a.platform)}</td><td>{fmtTime(a.last_seen)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
      <div className="card stack">
        <h3>Phone models</h3>
        <HBars testid="devices" label="Agents per phone model" items={d.devices.map(p => ({ key: `${p.device}|${p.platform}`, label: p.device === 'unknown' ? 'Not reported' : p.device, value: p.agents, sub: platformLabel(p.platform) }))} />
        <small className="muted">Tablets show as Android, iPhone / iPad or web until the main app reports screen size.</small>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Listings Analytics (7)
function ListingsTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: l, err, busy, load } = useLoad<DashListings>(() => api.dashListings(range.from, range.to, 60), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!l) return <Loading />;
  const statuses = sortStatuses(l.by_status);
  return (
    <div className="stack" data-testid="dash-listings">
      <Head title="Listings" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Listings" value={fmtNum(l.total)} sub={`${fmtNum(l.agents_with_listings)} agents`} />
        <Stat label="Deleted (kept for audit)" value={fmtNum(l.deleted)} />
        <Stat label={`Stale (${l.stale_days}+ days)`} value={fmtNum(l.stale_count)} sub="Available, no change" level={l.stale_count ? 'amber' : 'ok'} />
        <Stat label="New in this period" value={fmtNum(l.new_by_month.reduce((s, m) => s + m.new, 0))} />
      </div>
      <div className="grid2">
        <div className="card stack">
          <h3>By status</h3>
          <HBars testid="by-status" label="Listings by status" items={statuses.map(s => ({ key: s.key, label: s.label, value: s.n }))} />
        </div>
        <div className="card stack">
          <h3>Sale or rent</h3>
          <HBars label="Listings by purpose" items={Object.entries(l.by_purpose).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: PURPOSE_LABEL[k] ?? k, value: n }))} />
          <h3>By state</h3>
          <HBars label="Listings by state" items={l.by_state.slice(0, 16).map(s => ({ key: s.state, label: s.state, value: s.listings }))} />
        </div>
      </div>
      <div className="card stack">
        <h3>Property type</h3>
        <HBars label="Listings by property type" items={l.by_type.map(t => ({ key: t.type, label: t.type, value: t.listings }))} />
      </div>
      <div className="card stack">
        <h3>New listings per month</h3>
        <Bars label="New listings per month (by date created)" items={l.new_by_month.map(m => ({ label: m.month.slice(0, 7), value: m.new }))} />
      </div>
      <h3>Stale listings</h3>
      <p className="muted small" style={{ margin: 0 }}>Available listings with no change for {l.stale_days} days or more, oldest first.</p>
      {l.stale === null || !can(me.role, 'viewDashAgents') ? <Hidden what="The list (it names agents) is" /> : l.stale.length === 0 ? <p className="muted">No stale listings.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="stale">
            <thead><tr><th>Listing</th><th>Where</th><th>Agent</th><th>Last change</th><th>Days</th></tr></thead>
            <tbody>{l.stale.map(s => (
              <tr key={`${s.user_id}/${s.id}`}>
                <td><b>{s.ref ?? s.id}</b><br /><small className="muted">{s.headline ?? s.type ?? ''}</small></td>
                <td className="small">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                <td><AgentLink id={s.user_id} email={s.email} name={s.name} /></td>
                <td className="small">{fmtTime(s.updated_at)}</td><td>{s.days}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Deal Pipeline (59)
function PipelineTab() {
  const { api } = useAdmin();
  const today = todayKL();
  const { data: l, err, busy, load } = useLoad<DashListings>(() => api.dashListings(presetRange('365', today).from, today, 60), [api, today]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!l) return <Loading />;
  const lane = (title: string, stages: DashListings['pipeline']['sale'], testid: string) => {
    const total = stages.reduce((s, x) => s + x.listings, 0);
    return (
      <div className="card stack" data-testid={testid}>
        <div className="row"><h3 className="spacer">{title}</h3><span className="tag">{total} listings</span></div>
        <ol className="lane">
          {stages.map(s => (
            <li key={s.stage}>
              <span className="l">{PIPELINE_LABEL[s.stage] ?? statusLabel(s.stage)}</span>
              <b className="v">{s.listings}</b>
              {s.parts && <small className="muted">{Object.entries(s.parts).filter(([, n]) => n).map(([k, n]) => `${statusLabel(k).replace('Booked - ', '')} ${n}`).join(' · ') || ' '}</small>}
            </li>
          ))}
        </ol>
      </div>
    );
  };
  return (
    <div className="stack" data-testid="dash-pipeline">
      <Head title="Deal pipeline (all listings now)" onRefresh={() => void load()} busy={busy} />
      {lane('Sale', l.pipeline.sale, 'lane-sale')}
      {lane('Rent', l.pipeline.rent, 'lane-rent')}
      <small className="muted">“Booked” includes plain Booked, Pending SPA, Other Agent (Pending SPA) and Pending Consent. Deleted listings are not counted.</small>
    </div>
  );
}

// ---------------------------------------------------------------- Feature Usage & User Activity (6, 62)
type KindFilter = 'screen' | 'feature' | 'google' | 'all';
function UsageTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: u, err, busy, load } = useLoad<DashUsage>(() => api.dashUsage(range.from, range.to), [api, range.from, range.to]);
  const [kind, setKind] = useState<KindFilter>('screen');
  const [drill, setDrill] = useState<{ kind: string; name: string } | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!u) return <Loading />;
  const rows = u.ranking.filter(r => (kind === 'all' ? r.kind !== 'session' : r.kind === kind));
  const names = can(me.role, 'viewDashAgents');
  const oldDays = u.detail_from > range.from;
  return (
    <div className="stack" data-testid="dash-usage">
      <Head title="Feature usage" onRefresh={() => void load()} busy={busy} />
      <div className="card stack">
        <h3>Screens and features opened per day</h3>
        <Bars label="Screens and features opened per day" items={u.by_day.map(d => ({ label: d.day, value: d.events }))} />
        {oldDays && <small className="muted">Before {u.detail_from} only daily totals are kept, so the chart and heatmap start there.</small>}
      </div>
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {([['screen', 'Screens'], ['feature', 'Features'], ['google', 'Google calls'], ['all', 'Everything']] as const).map(([k, t]) =>
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`ukind-${k}`}>{t}</button>)}
      </div>
      <div className="card stack">
        <h3>Most used first</h3>
        <HBars testid="ranking" label="Most used" unit="times" onPick={names ? key => { const [k, ...n] = key.split('|'); setDrill({ kind: k, name: n.join('|') }); } : undefined}
          items={rows.map(r => ({ key: `${r.kind}|${r.name}`, label: <>{kind === 'all' && <small className="muted">{kindLabel(r.kind)} · </small>}{nameLabel(r.name)}</>, value: r.events,
            sub: `${r.agents} agent${r.agents === 1 ? '' : 's'}${r.failures ? ` · ${r.failures} failed` : ''}` }))} />
        {names && <small className="muted">Tap a line to see each time it was used.</small>}
      </div>
      {drill && <EventsBox kind={drill.kind} name={drill.name} range={range} onClose={() => setDrill(null)} />}
      <div className="card stack" data-testid="not-used">
        <h3>Not used in this period</h3>
        {u.not_used.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Every screen and feature seen before was used.</p> : (
          <p style={{ margin: 0 }}>{u.not_used.map(k => <span key={`${k.kind}|${k.name}`} className="tag" style={{ margin: '0 6px 6px 0' }}>{nameLabel(k.name)}</span>)}</p>
        )}
        <small className="muted">Screens and features that were used at some time before, but not in this period.</small>
      </div>
      <div className="card stack">
        <h3>When agents use the app</h3>
        <Heatmap testid="heatmap" rows={u.heatmap} />
      </div>
    </div>
  );
}

function EventsBox({ kind, name, range, onClose }: { kind: string; name: string; range: Range; onClose: () => void }) {
  const { api } = useAdmin();
  const { data: e, err } = useLoad<DashEvents>(() => api.dashEvents(kind, name, range.from, range.to, 200), [api, kind, name, range.from, range.to]);
  return (
    <div className="card stack" data-testid="events">
      <div className="row"><h3 className="spacer">{kindLabel(kind)}: {nameLabel(name)}</h3><button className="btn small" onClick={onClose}>Close</button></div>
      {err ? <ErrorBox text={err} /> : !e ? <Loading /> : (
        <>
          <small className="muted">{e.total} times in the period{e.total > e.events.length ? `; newest ${e.events.length} shown` : ''}. Opening this list is recorded.</small>
          <div className="tablewrap dash-table"><table>
            <thead><tr><th>When</th><th>Agent</th><th>Result</th><th>App</th></tr></thead>
            <tbody>{e.events.map((x, i) => (
              <tr key={i}><td className="small">{fmtTime(x.at)}</td><td><AgentLink id={x.user_id} email={x.email} name={x.name} /></td>
                <td>{x.ok ? <span className="tag ok">OK</span> : <span className="tag red">Failed</span>}{x.value != null ? <small className="muted"> {x.value}</small> : null}</td>
                <td className="small">{x.app_version ?? '—'} · {platformLabel(x.platform)}{x.device ? ` · ${x.device}` : ''}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Export (Owner + Compliance)
function DashExport({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try { const r = await exportDashboards(api, me.email, format, range.from, range.to); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="row">
      <small className="muted">Report for {range.from} to {range.to}:</small>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="dash-pdf">{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="dash-xlsx">{busy === 'xlsx' ? 'Making…' : 'Excel'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="dash-export-msg">{msg.text}</small>}
    </div>
  );
}
