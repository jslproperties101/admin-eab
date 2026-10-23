// AdminBatch009 — Listings & market (features 102, 103, 104, 105, 107, 108, 109, 110), one screen with tabs.
//   Quality     listing quality score out of 100; "needs photos / missing details" list
//   Days        days on market by state, city and type (open now; closed in the period)
//   Price       asking vs final price for deals linked to a listing
//   Areas       hot areas: listings (supply) and enquiries (demand) per state and city
//   Stuck       Booked deals with no change for 30 days (Joe) — or 45 / 60 / 90
//   Commission  open deals by month and stage; received in the period
//   Projects    opens and invitation-code redemptions per pushed project
//   News        Market News open rates by post, group and language; best time to post
// Viewer sees totals and charts only; lists that name agents are for Owner / Admin / Compliance and are written to the
// access log by the database. Exports (Owner / Compliance) cover every tab.
import { ReactNode, useState } from 'react';
import { MarketTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { MarketAreas, MarketCommission, MarketDom, MarketNews, MarketPrice, MarketProjects, MarketQuality, MarketStuck } from '../api/admin';
import { todayKL } from '../admin/health';
import { Range, fmtNum, fmtPct0, languageLabel, presetRange } from '../admin/dash';
import {
  BAND_LABEL, GOOD_SCORE, MISSING_ORDER, STUCK_CHOICES, STUCK_DAYS, audienceLabel, bandLevel, bandOf, fmtDays, fmtHours, fmtRm, fmtSignedPct,
  heatShade, missingLabel, monthLabel, sideLabel, slotLabel, stageLabel,
} from '../admin/market';
import { exportMarket } from '../export/market';
import { fmtTime } from '../export/reports';
import { AgentLink, Head, Hidden, RangePicker, Stat, useLoad } from './Dashboards';
import { Bars, HBars, Heatmap } from './charts';
import { ErrorBox, Loading } from './ui';

const TABS: { k: MarketTab; label: string }[] = [
  { k: 'quality', label: 'Listing quality' }, { k: 'dom', label: 'Days on market' }, { k: 'price', label: 'Asking vs final' },
  { k: 'areas', label: 'Hot areas' }, { k: 'stuck', label: 'Stuck deals' }, { k: 'commission', label: 'Commission' },
  { k: 'projects', label: 'Projects' }, { k: 'news', label: 'News engagement' },
];
/** Tabs that show "now" and do not use the date filter. */
const NO_RANGE: MarketTab[] = ['quality', 'stuck'];
const LONG: MarketTab[] = ['dom', 'price', 'commission'];

export function MarketScreen({ tab: first }: { tab: MarketTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<MarketTab>(first);
  const [range, setRange] = useState<Range>(() => presetRange(LONG.includes(first) ? '365' : '90', todayKL()));
  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">Listings &amp; market</h1>
        {can(me.role, 'export') && <MarketExport range={range} />}
      </div>
      <div className="tabs" role="group" aria-label="Listings and market">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`mtab-${t.k}`}>{t.label}</button>)}
      </div>
      {!NO_RANGE.includes(tab) && <RangePicker range={range} onChange={setRange} />}
      {tab === 'quality' && <QualityTab />}
      {tab === 'dom' && <DomTab range={range} />}
      {tab === 'price' && <PriceTab range={range} />}
      {tab === 'areas' && <AreasTab range={range} />}
      {tab === 'stuck' && <StuckTab />}
      {tab === 'commission' && <CommissionTab range={range} />}
      {tab === 'projects' && <ProjectsTab range={range} />}
      {tab === 'news' && <NewsTab range={range} />}
      {!can(me.role, 'viewMarketAgents') && (
        <p className="notice small" data-testid="names-hidden">Your role sees totals and charts only. Lists that name agents are shown to the Owner, Admin and Compliance only.</p>
      )}
    </div>
  );
}

const Limit = ({ children }: { children: ReactNode }) => <p className="notice small" data-testid="limit">{children}</p>;
const plural = (n: number, w: string) => `${fmtNum(n)} ${w}${n === 1 ? '' : 's'}`;
const where = (city: string | null, state: string | null) => [city, state].filter(Boolean).join(', ') || '—';

// ---------------------------------------------------------------- 102 Listing quality score
function QualityTab() {
  const { api, me } = useAdmin();
  const { data: q, err, busy, load } = useLoad<MarketQuality>(() => api.marketQuality(GOOD_SCORE, 500), [api]);
  const [missing, setMissing] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!q) return <Loading />;
  const weak = (q.weak ?? []).filter(w => !missing || w.missing.includes(missing));
  return (
    <div className="stack" data-testid="mkt-quality">
      <Head title="Listing quality (listings on the market now)" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Listings scored" value={fmtNum(q.listings)} sub="not sold, rented or withdrawn" />
        <Stat label="Average score" value={q.average === null ? '—' : `${fmtNum(q.average, 1)} / 100`} level={q.average === null ? undefined : bandLevel(bandOf(q.average))} />
        <Stat label={BAND_LABEL.good} value={fmtNum(q.bands.good)} level="ok" />
        <Stat label={BAND_LABEL.fair} value={fmtNum(q.bands.fair)} level={q.bands.fair ? 'amber' : 'ok'} />
        <Stat label={BAND_LABEL.poor} value={fmtNum(q.bands.poor)} level={q.bands.poor ? 'red' : 'ok'} />
      </div>
      <div className="grid2">
        <div className="card stack">
          <h3>What is missing most</h3>
          <HBars testid="missing" label="Listings missing each detail"
            onPick={can(me.role, 'viewMarketAgents') ? k => setMissing(m => (m === k ? null : k)) : undefined}
            items={MISSING_ORDER.filter(k => q.missing[k]).map(k => ({ key: k, label: missingLabel(k), value: q.missing[k] }))} />
          {can(me.role, 'viewMarketAgents') && <small className="muted">Tap a line to show only the listings missing it.</small>}
        </div>
        <div className="card stack">
          <h3>Average score by state</h3>
          <HBars label="Average score by state" items={q.by_state.slice(0, 16).map(s => ({ key: s.state, label: s.state, value: Number(s.average), sub: plural(s.listings, 'listing') }))} />
        </div>
      </div>
      <div className="card small muted">
        Score out of 100: photos 30 (5 or more), price 15, title type 10, tenure 10, size 10, bedrooms / bathrooms 10 (land and
        commercial lots get these free), state + city 10, map pin 5.
      </div>
      <div className="row"><h3 className="spacer">Needs work (below {q.below})</h3><span className="tag">{fmtNum(q.weak_count)} listings</span>
        {missing && <button className="btn small" onClick={() => setMissing(null)} data-testid="missing-clear">Show all ({missingLabel(missing)})</button>}</div>
      {q.weak === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : weak.length === 0 ? <p className="muted">No listings below {q.below}.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="weak">
            <thead><tr><th>Listing</th><th>Where</th><th>Agent</th><th>Score</th><th>Missing</th></tr></thead>
            <tbody>{weak.map(w => (
              <tr key={`${w.user_id}/${w.id}`}>
                <td><b>{w.ref ?? w.id}</b><br /><small className="muted">{w.headline ?? w.type ?? ''}</small></td>
                <td className="small">{where(w.city, w.state)}</td>
                <td><AgentLink id={w.user_id} email={w.email} name={w.name} /></td>
                <td><span className={`tag ${bandOf(w.score) === 'poor' ? 'red' : 'amber'}`}>{w.score}</span></td>
                <td className="small">{w.missing.map(missingLabel).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 103 Days on market
function DomTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const { data: d, err, busy, load } = useLoad<MarketDom>(() => api.marketDom(range.from, range.to), [api, range.from, range.to]);
  const [by, setBy] = useState<'state' | 'city' | 'type'>('state');
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!d) return <Loading />;
  const rows = by === 'state' ? d.by_state.map(r => ({ ...r, k: r.state })) : by === 'city' ? d.by_city.map(r => ({ ...r, k: `${r.city}, ${r.state}` })) : d.by_type.map(r => ({ ...r, k: r.type }));
  return (
    <div className="stack" data-testid="mkt-dom">
      <Head title="Days on market" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="On the market now" value={fmtNum(d.open.listings)} sub="Available or not set" />
        <Stat label="Median days listed" value={fmtDays(d.open.median)} sub={`average ${fmtDays(d.open.average)}`} />
        <Stat label="Sold or rented in period" value={fmtNum(d.closed.listings)} sub={`median ${fmtDays(d.closed.median)} to close`} />
        <Stat label="180+ days" value={fmtNum(d.open.buckets.d180_plus)} level={d.open.buckets.d180_plus ? 'amber' : 'ok'} />
      </div>
      <div className="card stack">
        <h3>How long listings have been on the market</h3>
        <HBars testid="dom-buckets" label="Listings by days on the market" items={[
          { key: 'u30', label: 'Under 30 days', value: d.open.buckets.under_30 }, { key: '30', label: '30-89 days', value: d.open.buckets.d30_89 },
          { key: '90', label: '90-179 days', value: d.open.buckets.d90_179 }, { key: '180', label: '180 days or more', value: d.open.buckets.d180_plus }]} />
      </div>
      <div className="tabs" role="group" aria-label="Group by" style={{ margin: 0 }}>
        {(['state', 'city', 'type'] as const).map(k => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)} data-testid={`dom-by-${k}`}>By {k === 'type' ? 'property type' : k}</button>)}
      </div>
      <div className="tablewrap dash-table mkt-table">
        <table data-testid="dom-table">
          <thead><tr><th>{by === 'type' ? 'Type' : by === 'city' ? 'City' : 'State'}</th><th>On market</th><th>Median days</th><th>Average</th><th>Oldest</th><th>Closed in period</th><th>Median to close</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k}><td>{r.k}</td><td>{fmtNum(r.open)}</td><td>{fmtDays(r.median)}</td><td>{fmtDays(r.average)}</td><td>{fmtDays(r.oldest)}</td>
              <td>{fmtNum(r.closed)}</td><td>{fmtDays(r.closed_median)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <Limit>Days are counted from the day the listing was added. The app does not record the day a listing was sold or rented,
        so “to close” uses the listing’s last change. Price changes cannot be shown yet: the main app does not keep old prices.
        {d.no_date ? ` ${d.no_date} listings have no date and are left out.` : ''}</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 104 Asking vs final price
function PriceTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: p, err, busy, load } = useLoad<MarketPrice>(() => api.marketPrice(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!p) return <Loading />;
  return (
    <div className="stack" data-testid="mkt-price">
      <Head title="Asking vs final price" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Deals in period" value={fmtNum(p.deals)} sub={`${fmtNum(p.compared)} compared`} />
        <Stat label="Median difference" value={fmtSignedPct(p.median_pct)} sub={`average ${fmtSignedPct(p.average_pct)}`} />
        <Stat label="Below asking" value={fmtNum(p.below)} sub={`${fmtNum(p.at)} at · ${fmtNum(p.above)} above`} />
        <Stat label="Not linked to a listing" value={fmtNum(p.not_linked)} sub={p.no_price ? `${p.no_price} without a price` : undefined} level={p.not_linked ? 'amber' : 'ok'} />
      </div>
      <div className="grid2">
        <div className="card stack" data-testid="price-by-state">
          <h3>By state</h3>
          <table className="small"><thead><tr><th>State</th><th>Deals</th><th>Median</th><th>Average</th></tr></thead>
            <tbody>{p.by_state.map(s => <tr key={s.state}><td>{s.state}</td><td>{s.deals}</td><td>{fmtSignedPct(s.median_pct)}</td><td>{fmtSignedPct(s.average_pct)}</td></tr>)}</tbody></table>
        </div>
        <div className="card stack">
          <h3>By property type and sale / rental</h3>
          <table className="small"><thead><tr><th>Type</th><th>Deals</th><th>Median</th></tr></thead>
            <tbody>{p.by_type.map(s => <tr key={s.type}><td>{s.type}</td><td>{s.deals}</td><td>{fmtSignedPct(s.median_pct)}</td></tr>)}
              {p.by_side.map(s => <tr key={`side-${s.side}`}><td><i>{sideLabel(s.side)}</i></td><td>{s.deals}</td><td>{fmtSignedPct(s.median_pct)}</td></tr>)}</tbody></table>
        </div>
      </div>
      <h3>Deals compared</h3>
      {p.list === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : p.list.length === 0 ? <p className="muted">No deals linked to a listing with a price in this period.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="price-list">
            <thead><tr><th>Date</th><th>Listing</th><th>Agent</th><th>Asking</th><th>Final</th><th>Difference</th></tr></thead>
            <tbody>{p.list.map(x => (
              <tr key={`${x.user_id}/${x.deal_id}`}>
                <td className="small">{x.date}<br /><small className="muted">{sideLabel(x.side)}</small></td>
                <td><b>{x.ref ?? '—'}</b><br /><small className="muted">{x.headline ?? x.type ?? ''} · {where(x.city, x.state)}</small></td>
                <td><AgentLink id={x.user_id} email={x.email} name={x.name} /></td>
                <td>{fmtRm(x.asking)}</td><td>{fmtRm(x.final)}</td>
                <td><span className={`tag ${x.pct < 0 ? 'amber' : 'ok'}`}>{fmtSignedPct(x.pct)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Limit>Final price = the deal’s price or rent; asking = the listing’s asking price (sale) or monthly rent (rental). Only deals
        that the agent linked to a listing can be compared. A separate “final price” is not recorded by the main app yet.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 105 Hot areas
function AreasTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const { data: a, err, busy, load } = useLoad<MarketAreas>(() => api.marketAreas(range.from, range.to), [api, range.from, range.to]);
  const [state, setState] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!a) return <Loading />;
  const cities = a.by_city.filter(c => !state || c.state === state);
  return (
    <div className="stack" data-testid="mkt-areas">
      <Head title="Hot areas" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="On the market now" value={fmtNum(a.on_market)} />
        <Stat label="New listings in period" value={fmtNum(a.new)} />
        <Stat label="Enquiries in period" value={fmtNum(a.enquiries)} sub={a.enquiries_unlinked ? `${a.enquiries_unlinked} not about a listing` : undefined} />
        <Stat label="Sold or rented in period" value={fmtNum(a.closed)} />
      </div>
      <div className="card stack">
        <h3>Enquiries by state</h3>
        <HBars testid="areas-states" label="Enquiries by state" unit="enquiries" onPick={k => setState(s => (s === k ? null : k))}
          items={a.by_state.map(s => ({ key: s.state, label: s.state, value: s.enquiries, sub: `${s.on_market} on market` }))} />
        <small className="muted">Tap a state to see only its cities.</small>
      </div>
      <div className="row"><h3 className="spacer">Cities{state ? ` in ${state}` : ''}</h3>{state && <button className="btn small" onClick={() => setState(null)}>All states</button>}</div>
      <div className="tablewrap dash-table mkt-table">
        <table data-testid="areas-grid">
          <thead><tr><th>City</th><th>On market (supply)</th><th>Enquiries (demand)</th><th>Enquiries per listing</th><th>New</th><th>Closed</th></tr></thead>
          <tbody>{cities.map(c => (
            <tr key={`${c.state}/${c.city}`}>
              <td>{c.city}<br /><small className="muted">{c.state}</small></td>
              <td style={{ background: heatShade(c.supply_level) }}>{fmtNum(c.on_market)}</td>
              <td style={{ background: heatShade(c.demand_level) }}>{fmtNum(c.enquiries)}</td>
              <td>{c.per_listing === null ? '—' : fmtNum(c.per_listing, 2)}</td><td>{fmtNum(c.new)}</td><td>{fmtNum(c.closed)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Limit>Darker gold = more. “Demand” is the number of enquiries agents recorded about listings in each area — the main app does
        not record buyer requirements yet, so Buyer Demand vs Supply (106) waits for that.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 107 Stuck deals
function StuckTab() {
  const { api, me } = useAdmin();
  const [days, setDays] = useState<number>(STUCK_DAYS);
  const { data: s, err, busy, load } = useLoad<MarketStuck>(() => api.marketStuck(days), [api, days]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  return (
    <div className="stack" data-testid="mkt-stuck">
      <Head title={`Stuck deals (no change for ${s.days}+ days)`} onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Days" style={{ margin: 0 }}>
          {STUCK_CHOICES.map(d => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)} data-testid={`stuck-${d}`}>{d} days{d === STUCK_DAYS ? ' (default)' : ''}</button>)}
        </div>
      </Head>
      <div className="stats">
        <Stat label="Booked, before SPA signed" value={fmtNum(s.booked)} />
        <Stat label="Stuck" value={fmtNum(s.stuck_count)} level={s.stuck_count ? 'red' : 'ok'} />
      </div>
      <div className="card stack">
        <h3>By stage</h3>
        <HBars testid="stuck-stages" label="Stuck deals by stage" items={s.by_stage.map(x => ({ key: x.stage, label: stageLabel(x.stage), value: x.stuck,
          sub: `of ${x.booked} · oldest ${fmtDays(x.oldest)}` }))} />
      </div>
      {s.list === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : s.list.length === 0 ? <p className="muted">No stuck deals.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="stuck-list">
            <thead><tr><th>Listing</th><th>Stage</th><th>Agent</th><th>Asking</th><th>Last change</th><th>Days</th></tr></thead>
            <tbody>{s.list.map(x => (
              <tr key={`${x.user_id}/${x.id}`}>
                <td><b>{x.ref ?? x.id}</b><br /><small className="muted">{x.headline ?? x.type ?? ''} · {where(x.city, x.state)}</small></td>
                <td className="small">{stageLabel(x.stage)}</td>
                <td><AgentLink id={x.user_id} email={x.email} name={x.name} /></td>
                <td>{fmtRm(x.asking)}</td><td className="small">{fmtTime(x.updated_at)}</td><td><b>{x.days}</b></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Limit>“No change” means the agent has not changed the listing at all for that many days. The main app does not yet record the
        day each Booked stage started, so a listing edited for another reason starts counting again.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 108 Commission forecast
function CommissionTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: c, err, busy, load } = useLoad<MarketCommission>(() => api.marketCommission(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!c) return <Loading />;
  const today = todayKL().slice(0, 7);
  const ahead = c.by_month.filter(m => m.month >= today);
  return (
    <div className="stack" data-testid="mkt-commission">
      <Head title="Commission forecast" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Open deals (all dates)" value={fmtNum(c.open.deals)} sub={`worth ${fmtRm(c.open.value, true)}`} />
        <Stat label="Expected commission" value={fmtRm(c.open.commission)} sub={`confirmed ${fmtRm(c.open.confirmed, true)} · estimated ${fmtRm(c.open.estimated, true)}`} />
        <Stat label="Agents’ share" value={fmtRm(c.open.agents_share)} sub="after co-broke shares" />
        <Stat label="Received in period" value={fmtRm(c.received.commission)} sub={`${fmtNum(c.received.deals)} deals`} />
        <Stat label="Deal date passed" value={fmtNum(c.open.overdue)} sub="still not received" level={c.open.overdue ? 'amber' : 'ok'} />
      </div>
      <div className="card stack">
        <h3>Expected by month of the deal date</h3>
        <Bars testid="commission-months" label="Expected commission per month (RM)" items={c.by_month.map(m => ({ label: monthLabel(m.month), value: Math.round(m.commission) }))} />
        {ahead.length > 0 && <small className="muted">From this month on: {fmtRm(ahead.reduce((s, m) => s + m.commission, 0))} in {ahead.reduce((s, m) => s + m.deals, 0)} deals.</small>}
        {c.open.no_date > 0 && <small className="muted">{c.open.no_date} open deals have no date and are not in the chart.</small>}
      </div>
      <div className="grid2">
        <div className="card stack">
          <h3>By listing stage</h3>
          <HBars testid="commission-stages" label="Expected commission by stage" items={c.by_stage.map(s => ({ key: s.stage, label: stageLabel(s.stage), value: Math.round(s.commission), sub: `${s.deals} deals` }))} />
        </div>
        <div className="card stack">
          <h3>Sale or rental</h3>
          <HBars label="Expected commission by sale or rental" items={c.by_side.map(s => ({ key: s.side, label: sideLabel(s.side), value: Math.round(s.commission), sub: `${s.deals} deals` }))} />
        </div>
      </div>
      <h3>By agent</h3>
      {c.agents === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : c.agents.length === 0 ? <p className="muted">No open deals.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="commission-agents">
            <thead><tr><th>Agent</th><th>Open deals</th><th>Commission</th><th>Agent’s share</th><th>Next deal date</th></tr></thead>
            <tbody>{c.agents.map(a => (
              <tr key={a.user_id}><td><AgentLink id={a.user_id} email={a.email} name={a.name} /></td><td>{a.deals}</td>
                <td>{fmtRm(a.commission)}</td><td>{fmtRm(a.agents_share)}</td><td className="small">{a.next_date ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Limit>From the agents’ own deal records (Estimated and Confirmed = open). Commission is the amount typed, or price × rate.
        The period filter only changes “Received in period”; open deals are shown whatever their date.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 109 Project performance
function ProjectsTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const { data: p, err, busy, load } = useLoad<MarketProjects>(() => api.marketProjects(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!p) return <Loading />;
  return (
    <div className="stack" data-testid="mkt-projects">
      <Head title="Project performance" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Projects" value={fmtNum(p.projects)} />
        <Stat label="Agents reached" value={fmtNum(p.reached)} />
        <Stat label="Opened in period" value={fmtNum(p.opened)} sub={fmtPct0(p.reached ? (p.opened / p.reached) * 100 : null)} />
        <Stat label="Code redemptions" value={fmtNum(p.redeemed)} />
      </div>
      <div className="card stack">
        <h3>Opens per day</h3>
        <Bars label="Project opens per day" items={p.by_day.map(d => ({ label: d.day, value: d.opened }))} />
      </div>
      {p.list.length === 0 ? <p className="muted">No pushed projects in this period.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="projects-list">
            <thead><tr><th>Project</th><th>Audience</th><th>Reached</th><th>Opened</th><th>Open rate</th><th>Codes redeemed</th></tr></thead>
            <tbody>{p.list.map(x => (
              <tr key={x.id}>
                <td><b>{x.title}</b><br /><small className="muted">{x.developer ?? ''}{x.developer ? ' · ' : ''}{fmtTime(x.published_at)}{x.status !== 'published' ? ` · ${x.status}` : ''}</small></td>
                <td className="small">{audienceLabel(x.audience)}</td><td>{fmtNum(x.reached)}</td><td>{fmtNum(x.opened)}</td>
                <td>{fmtPct0(x.open_pct)}</td><td>{fmtNum(x.redeemed)}{x.codes ? <small className="muted"> ({x.codes} codes)</small> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Limit>“Reached” = agents who can see the project now (everyone, its groups, or who used a code). Enquiries per project are not
        recorded by the main app yet. Agents who used a code are listed under News → Codes.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 110 Market News engagement
function NewsTab({ range }: { range: Range }) {
  const { api } = useAdmin();
  const { data: n, err, busy, load } = useLoad<MarketNews>(() => api.marketNews(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!n) return <Loading />;
  return (
    <div className="stack" data-testid="mkt-news">
      <Head title="Market News engagement" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Posts in period" value={fmtNum(n.posts)} />
        <Stat label="Open rate" value={fmtPct0(n.open_pct)} sub={`${fmtNum(n.opened)} of ${fmtNum(n.reached)}`} />
        <Stat label="With push alert" value={fmtPct0(n.with_alert.open_pct)} sub={plural(n.with_alert.posts, 'post')} />
        <Stat label="Without alert" value={fmtPct0(n.without_alert.open_pct)} sub={plural(n.without_alert.posts, 'post')} />
      </div>
      <div className="card stack" data-testid="best-times">
        <h3>Best times to post</h3>
        {n.best.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No opens recorded yet.</p>
          : <ol style={{ margin: 0 }}>{n.best.map(b => <li key={`${b.dow}-${b.hour}`}>{slotLabel(b.dow, b.hour)} <small className="muted">· {plural(b.opens, 'open')}</small></li>)}</ol>}
        <Heatmap testid="news-heatmap" rows={n.heatmap} caption={m => `Market News opened, by day and hour (Malaysia time). Darker = more. Busiest hour: ${m} opens.`} />
      </div>
      <div className="grid2">
        <div className="card stack">
          <h3>By language</h3>
          <HBars testid="news-languages" label="Open rate by language" unit="%" share={false} items={n.by_language.map(l => ({ key: l.language, label: languageLabel(l.language),
            value: Math.round(l.open_pct ?? 0), sub: `${l.opened} of ${l.reached}` }))} />
        </div>
        <div className="card stack">
          <h3>By audience group</h3>
          <HBars testid="news-groups" label="Open rate by audience group" unit="%" share={false} items={n.by_group.map(g => ({ key: g.group_id, label: g.group,
            value: Math.round(g.open_pct ?? 0), sub: `${g.opened} of ${g.reached}` }))} />
        </div>
      </div>
      {n.list.length === 0 ? <p className="muted">No posts in this period.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="news-list">
            <thead><tr><th>Post</th><th>Audience</th><th>Reached</th><th>Opened</th><th>Open rate</th><th>Half opened within</th></tr></thead>
            <tbody>{n.list.map(x => (
              <tr key={x.id}>
                <td><b>{x.title}</b><br /><small className="muted">{fmtTime(x.published_at)}{x.push_alert ? ' · push alert' : ''}</small></td>
                <td className="small">{audienceLabel(x.audience)}</td><td>{fmtNum(x.reached)}</td><td>{fmtNum(x.opened)}</td>
                <td>{fmtPct0(x.open_pct)}</td><td className="small">{fmtHours(x.median_hours)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Limit>“Reached” uses each agent’s groups today. Open rate by group and language counts each agent once per post. Totals only — no names.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- Export (Owner + Compliance)
function MarketExport({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try { const r = await exportMarket(api, me.email, format, range.from, range.to); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="row">
      <small className="muted">Report for {range.from} to {range.to}:</small>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="mkt-pdf">{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="mkt-xlsx">{busy === 'xlsx' ? 'Making…' : 'Excel'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="mkt-export-msg">{msg.text}</small>}
    </div>
  );
}
