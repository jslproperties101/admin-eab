// AdminBatch010 — Content insight (features 54, 28, 8, 55, 60, 61), one screen with tabs.
//   Listings map   every listing with a map pin (filters: on the market / all, state, type, sale / rental)
//   Geography      agents by country, state and city; sign-in places rounded to ~10 km, only where 3+ agents are
//   Buyers & vendors  counts only (contact names and phone numbers never leave the database)
//   Price trends   median asking price and price per sq ft by the month listings were added; by area and type
//   AI commands    commands sent and how many the app understood (the words are not recorded)
//   Studio         Marketing Studio opens, posters made, saved and shared
// Viewer sees totals, charts and anonymous map dots. Lists that name agents are for Owner / Admin / Compliance and
// are written to the access log by the database. Exports (Owner / Compliance) cover every tab.
import { ReactNode, useState } from 'react';
import { ContentTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { MapPoint } from '../api/admin';
import { todayKL } from '../admin/health';
import { Range, fmtNum, fmtPct0, languageLabel, presetRange, statusLabel } from '../admin/dash';
import { fmtRm, monthLabel } from '../admin/market';
import { Bubble, channelLabel, contactRoleLabel, dotClass, fmtPpsf, vendorStatusLabel } from '../admin/content';
import { fmtTime } from '../export/reports';
import { exportContent } from '../export/content';
import { AgentLink, Head, Hidden, RangePicker, Stat, useLoad } from './Dashboards';
import { Bars, HBars, Heatmap } from './charts';
import { MapView } from './MapView';
import { ErrorBox, Loading } from './ui';

const TABS: { k: ContentTab; label: string }[] = [
  { k: 'map', label: 'Listings map' }, { k: 'geo', label: 'Geography' }, { k: 'contacts', label: 'Buyers & vendors' },
  { k: 'trends', label: 'Price trends' }, { k: 'ai', label: 'AI commands' }, { k: 'studio', label: 'Marketing Studio' },
];
/** Tabs that use the date filter. */
const RANGED: ContentTab[] = ['contacts', 'ai', 'studio'];

export function ContentScreen({ tab: first }: { tab: ContentTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<ContentTab>(first);
  const [range, setRange] = useState<Range>(() => presetRange(first === 'contacts' ? '365' : '90', todayKL()));
  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">Content insight</h1>
        {can(me.role, 'export') && <ContentExport range={range} />}
      </div>
      <div className="tabs" role="group" aria-label="Content insight">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`ctab-${t.k}`}>{t.label}</button>)}
      </div>
      {RANGED.includes(tab) && <RangePicker range={range} onChange={setRange} />}
      {tab === 'map' && <MapTab />}
      {tab === 'geo' && <GeoTab />}
      {tab === 'contacts' && <ContactsTab range={range} />}
      {tab === 'trends' && <TrendsTab />}
      {tab === 'ai' && <AiTab range={range} />}
      {tab === 'studio' && <StudioTab range={range} />}
      {!can(me.role, 'viewMarketAgents') && (
        <p className="notice small" data-testid="names-hidden">Your role sees totals, charts and map dots only. Lists that name agents are shown to the Owner, Admin and Compliance only.</p>
      )}
    </div>
  );
}

const Limit = ({ children }: { children: ReactNode }) => <p className="notice small" data-testid="limit">{children}</p>;
const where = (city: string | null | undefined, state: string | null | undefined) => [city, state].filter(Boolean).join(', ') || '—';

// ---------------------------------------------------------------- 54 Listings map
function MapTab() {
  const { api, me } = useAdmin();
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [state, setState] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [side, setSide] = useState<'sale' | 'rent' | null>(null);
  const { data: m, err, busy, load } = useLoad(() => api.mapListings(scope, state, type, side), [api, scope, state, type, side]);
  const [picked, setPicked] = useState<MapPoint[] | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!m) return <Loading />;
  const names = can(me.role, 'viewMarketAgents') && !m.names_hidden;
  const majority = (b: Bubble<MapPoint>) => {
    const n: Record<string, number> = {};
    for (const p of b.items) n[dotClass(p.status)] = (n[dotClass(p.status)] ?? 0) + 1;
    return Object.entries(n).sort((a, c) => c[1] - a[1])[0]?.[0] ?? 'other';
  };
  return (
    <div className="stack" data-testid="c-map">
      <Head title="Listings map" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Which listings" style={{ margin: 0 }}>
          <button aria-pressed={scope === 'open'} onClick={() => setScope('open')} data-testid="map-open">On the market</button>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')} data-testid="map-all">All</button>
        </div>
      </Head>
      <div className="filters">
        <select value={state ?? ''} onChange={e => { setState(e.target.value || null); setPicked(null); }} aria-label="State" data-testid="map-state">
          <option value="">All states</option>{m.states.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={type ?? ''} onChange={e => { setType(e.target.value || null); setPicked(null); }} aria-label="Property type" data-testid="map-type">
          <option value="">All types</option>{m.types.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={side ?? ''} onChange={e => { setSide((e.target.value || null) as 'sale' | 'rent' | null); setPicked(null); }} aria-label="Sale or rental" data-testid="map-side">
          <option value="">Sale and rental</option><option value="sale">Sale</option><option value="rent">Rental</option></select>
      </div>
      <div className="stats">
        <Stat label="Listings" value={fmtNum(m.listings)} />
        <Stat label="On the map" value={fmtNum(m.with_pin)} />
        <Stat label="No map pin" value={fmtNum(m.listings - m.with_pin)} level={m.listings - m.with_pin ? 'amber' : 'ok'} sub="not shown" />
      </div>
      <MapView testid="listings-map" points={m.points} label={`${fmtNum(m.with_pin)} listings with a map pin`} height={420}
        bubbleClass={b => majority(b)} onPick={setPicked}
        bubbleTitle={b => (b.items.length === 1 ? `${b.items[0].ref ?? b.items[0].type ?? 'Listing'} · ${statusLabel(b.items[0].status)}` : `${b.items.length} listings`)}
        legend={<span className="legend"><i className="sw avail" />Available <i className="sw booked" />Booked <i className="sw closed" />Sold / rented</span>} />
      {picked && (
        <div className="card stack" data-testid="map-picked">
          <div className="row"><h3 className="spacer">{picked.length} listing{picked.length === 1 ? '' : 's'} here</h3><button className="btn small" onClick={() => setPicked(null)}>Close</button></div>
          <div className="tablewrap"><table className="small">
            <thead><tr>{names && <th>Listing</th>}<th>Type</th><th>Status</th><th>Price</th><th>Where</th>{names && <th>Agent</th>}</tr></thead>
            <tbody>{picked.slice(0, 100).map((p, i) => (
              <tr key={i}>{names && <td><b>{p.ref ?? p.id}</b><br /><small className="muted">{p.headline ?? ''}</small></td>}
                <td>{p.type ?? '—'}</td><td>{statusLabel(p.status)}</td>
                <td>{p.price ? `${fmtRm(p.price)}${p.side === 'rent' ? ' / month' : ''}` : '—'}</td><td>{where(p.city, p.state)}</td>
                {names && <td>{p.user_id && <AgentLink id={p.user_id} email={p.email ?? null} name={p.name ?? null} />}</td>}</tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      <Limit>Tap a bubble to list the listings in it. Listings without a map pin are counted but cannot be shown. No owner details are shown.
        Map: © OpenStreetMap contributors (needs internet; dots still show offline).</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 28 Geography
function GeoTab() {
  const { api } = useAdmin();
  const { data: g, err, busy, load } = useLoad(() => api.geoAgents(), [api]);
  const [state, setState] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!g) return <Loading />;
  const cities = g.by_city.filter(c => !state || c.state === state);
  return (
    <div className="stack" data-testid="c-geo">
      <Head title="Where agents are" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Agents" value={fmtNum(g.agents)} />
        <Stat label="Countries" value={fmtNum(g.by_country.length)} />
        <Stat label="With listings" value={fmtNum(g.with_listings)} sub="state and city known" />
        <Stat label="With a sign-in place" value={fmtNum(g.with_place)} sub="last 90 days" />
      </div>
      <MapView testid="geo-map" points={g.cells} weight={c => c.agents} height={360}
        label={`Agents by area (about 10 km squares with 3 or more agents)${g.cells_hidden ? ` · ${g.cells_hidden} smaller areas hidden for privacy` : ''}`}
        bubbleTitle={b => `${Math.round(b.weight)} agents`} />
      <div className="grid2">
        <div className="card stack"><h3>By country</h3>
          <HBars testid="geo-countries" label="Agents by country" items={g.by_country.map(c => ({ key: c.country, label: c.country, value: c.agents }))} /></div>
        <div className="card stack"><h3>By state</h3>
          <HBars testid="geo-states" label="Agents by state" onPick={k => setState(s => (s === k ? null : k))}
            items={g.by_state.map(s => ({ key: s.state, label: s.state, value: s.agents }))} />
          <small className="muted">Tap a state to see its cities.</small></div>
      </div>
      <div className="row"><h3 className="spacer">Cities{state ? ` in ${state}` : ''}</h3>{state && <button className="btn small" onClick={() => setState(null)}>All states</button>}</div>
      <div className="tablewrap dash-table"><table data-testid="geo-cities">
        <thead><tr><th>City</th><th>State</th><th>Agents</th></tr></thead>
        <tbody>{cities.map(c => <tr key={`${c.state}/${c.city}`}><td>{c.city}</td><td>{c.state}</td><td>{fmtNum(c.agents)}</td></tr>)}</tbody>
      </table></div>
      <Limit>Country is what the agent chose at first sign-in (Malaysia when not chosen). State and city are where most of the agent's listings are.
        The map never shows where one agent is: sign-in places are rounded to about 10 km and only areas with 3 or more agents are drawn.
        Admin accounts are not counted.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 8 Buyers & vendors
function ContactsTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: c, err, busy, load } = useLoad(() => api.contactStats(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!c) return <Loading />;
  return (
    <div className="stack" data-testid="c-contacts">
      <Head title="Buyers and vendors" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Contacts" value={fmtNum(c.contacts)} sub={`${fmtNum(c.new_in_period)} new in period`} />
        <Stat label="Buyers" value={fmtNum(c.buyers)} sub={`${fmtNum(c.agents_with_buyers)} agents have buyers`} />
        <Stat label="Vendors (owners)" value={fmtNum(c.vendors)} sub={`${fmtNum(c.vendors_with_listing)} linked to a listing`} />
        <Stat label="Contacts in a deal" value={fmtNum(c.in_a_deal)} />
        <Stat label="Enquiries in period" value={fmtNum(c.enquiries)} sub={`${fmtNum(c.enquiries_with_contact)} with a contact`} />
      </div>
      <div className="grid2">
        <div className="card stack"><h3>Contacts by role</h3>
          <HBars testid="contact-roles" label="Contacts by role" items={c.by_role.map(r => ({ key: r.role, label: contactRoleLabel(r.role), value: r.contacts, sub: r.new ? `${r.new} new` : undefined }))} />
          <small className="muted">One contact can have more than one role.</small></div>
        <div className="card stack"><h3>Enquiries by channel</h3>
          <HBars testid="contact-channels" label="Enquiries by channel" items={c.enquiries_by_channel.map(r => ({ key: r.channel, label: channelLabel(r.channel), value: r.enquiries }))} /></div>
      </div>
      <div className="grid2">
        <div className="card stack"><h3>New contacts per month</h3>
          <Bars testid="contact-months" label="New buyers, vendors and others per month" items={c.by_month.map(m => ({ label: monthLabel(m.month), value: m.buyers + m.vendors + m.others }))} />
          {c.by_month.length > 0 && <small className="muted">{c.by_month.map(m => `${monthLabel(m.month)}: ${m.buyers} buyers, ${m.vendors} vendors`).slice(-3).join(' · ')}</small>}</div>
        <div className="card stack"><h3>Vendor status</h3>
          <HBars label="Vendors by status" items={Object.entries(c.vendor_status).map(([k, n]) => ({ key: k, label: vendorStatusLabel(k), value: n }))} /></div>
      </div>
      <h3>By agent</h3>
      {c.agents === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="Counts per agent are" /> : c.agents.length === 0 ? <p className="muted">No contacts yet.</p> : (
        <div className="tablewrap dash-table mkt-table"><table data-testid="contact-agents">
          <thead><tr><th>Agent</th><th>Contacts</th><th>Buyers</th><th>Vendors</th><th>New in period</th><th>Enquiries in period</th></tr></thead>
          <tbody>{c.agents.map(a => (
            <tr key={a.user_id}><td><AgentLink id={a.user_id} email={a.email} name={a.name} /></td><td>{fmtNum(a.contacts)}</td><td>{fmtNum(a.buyers)}</td>
              <td>{fmtNum(a.vendors)}</td><td>{fmtNum(a.new)}</td><td>{fmtNum(a.enquiries)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Limit>Counts only. The names, phone numbers and details of the agents' buyers and vendors are personal data (PDPA) and are never sent to Admin EAB.
        Buyer requirements (area, budget, rooms) are not recorded by the main app yet.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 55 Price trends
function TrendsTab() {
  const { api } = useAdmin();
  const [months, setMonths] = useState(12);
  const [state, setState] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const { data: t, err, busy, load } = useLoad(() => api.priceTrends(months, state, city, type), [api, months, state, city, type]);
  const [metric, setMetric] = useState<'ppsf' | 'price' | 'rent'>('ppsf');
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!t) return <Loading />;
  const series = t.by_month.map(m => ({ label: monthLabel(m.month),
    value: Math.round((metric === 'ppsf' ? m.median_ppsf : metric === 'price' ? m.median_price : m.median_rent) ?? 0) }));
  return (
    <div className="stack" data-testid="c-trends">
      <Head title="Price trends" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Months" style={{ margin: 0 }}>
          {[6, 12, 24].map(n => <button key={n} aria-pressed={months === n} onClick={() => setMonths(n)} data-testid={`trend-${n}`}>{n} months</button>)}
        </div>
      </Head>
      <div className="filters">
        <select value={state ?? ''} onChange={e => { setState(e.target.value || null); setCity(null); }} aria-label="State" data-testid="trend-state">
          <option value="">All states</option>{t.states.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={city ?? ''} onChange={e => setCity(e.target.value || null)} aria-label="City" data-testid="trend-city">
          <option value="">All cities</option>{t.cities.filter(c => !state || c.state === state).map(c => <option key={`${c.state}/${c.city}`} value={c.city}>{c.city}{state ? '' : `, ${c.state}`}</option>)}</select>
        <select value={type ?? ''} onChange={e => setType(e.target.value || null)} aria-label="Property type" data-testid="trend-type">
          <option value="">All types</option>{t.types.map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <div className="stats">
        <Stat label="Listings added" value={fmtNum(t.listings)} sub={`since ${monthLabel(t.since.slice(0, 7))}`} />
        <Stat label="Median sale price" value={fmtRm(t.sale.median_price, true)} sub={`${fmtNum(t.sale.listings)} for sale`} />
        <Stat label="Median price per sq ft" value={fmtPpsf(t.sale.median_ppsf)} />
        <Stat label="Median monthly rent" value={fmtRm(t.rent.median_rent)} sub={`${fmtNum(t.rent.listings)} for rent`} />
      </div>
      <div className="card stack">
        <div className="row"><h3 className="spacer">By the month listings were added</h3>
          <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
            {([['ppsf', 'Per sq ft'], ['price', 'Sale price'], ['rent', 'Rent']] as const).map(([k, l]) =>
              <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)} data-testid={`trend-m-${k}`}>{l}</button>)}
          </div></div>
        <Bars testid="trend-months" label={`Median ${metric === 'ppsf' ? 'price per sq ft' : metric === 'price' ? 'sale price' : 'monthly rent'} (RM); months without listings show as 0`} items={series} />
      </div>
      <h3>By area (sale)</h3>
      <div className="tablewrap dash-table mkt-table"><table data-testid="trend-areas">
        <thead><tr><th>City</th><th>Listings</th><th>Median price</th><th>Median psf</th><th>Last 6 months psf</th><th>6 months before</th><th>Change</th></tr></thead>
        <tbody>{t.by_area.map(a => (
          <tr key={`${a.state}/${a.city}`}><td>{a.city}<br /><small className="muted">{a.state}</small></td><td>{fmtNum(a.listings)}</td>
            <td>{fmtRm(a.median_price, true)}</td><td>{fmtPpsf(a.median_ppsf)}</td><td>{fmtPpsf(a.recent_ppsf)}</td><td>{fmtPpsf(a.before_ppsf)}</td>
            <td>{a.change_pct === null ? '—' : <span className={`tag ${a.change_pct < 0 ? 'amber' : 'ok'}`}>{a.change_pct > 0 ? '+' : ''}{a.change_pct}%</span>}</td></tr>
        ))}</tbody>
      </table></div>
      <h3>By property type</h3>
      <div className="tablewrap"><table className="small" data-testid="trend-types">
        <thead><tr><th>Type</th><th>Listings</th><th>Median sale price</th><th>Median psf</th><th>Median rent</th></tr></thead>
        <tbody>{t.by_type.map(x => <tr key={x.type}><td>{x.type}</td><td>{x.listings}</td><td>{fmtRm(x.median_price, true)}</td><td>{fmtPpsf(x.median_ppsf)}</td><td>{fmtRm(x.median_rent)}</td></tr>)}</tbody>
      </table></div>
      <Limit>From the agents' asking prices, grouped by the month each listing was added — this is the price of what was listed, not a price
        change: the main app does not keep old prices yet. Price per sq ft uses the built-up size (or land size when there is none).
        {t.no_date ? ` ${t.no_date} listings have no date and are left out.` : ''}</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 60 AI commands
function AiTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: a, err, busy, load } = useLoad(() => api.aiUsage(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!a) return <Loading />;
  return (
    <div className="stack" data-testid="c-ai">
      <Head title="AI Assisted Command" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Commands" value={fmtNum(a.commands)} sub={`${fmtNum(a.agents)} agents`} />
        <Stat label="Understood" value={fmtPct0(a.success_pct)} sub={`${fmtNum(a.understood)} commands`} level={a.success_pct === null ? undefined : a.success_pct >= 80 ? 'ok' : a.success_pct >= 60 ? 'amber' : 'red'} />
        <Stat label="Not understood" value={fmtNum(a.not_understood)} level={a.not_understood ? 'amber' : 'ok'} />
        <Stat label="Screen opened" value={fmtNum(a.screen_opens)} sub={`${fmtNum(a.screen_agents)} agents`} />
      </div>
      <div className="card stack"><h3>Not understood per day</h3>
        <Bars testid="ai-days" label="Commands not understood per day" items={a.by_day.map(d => ({ label: d.day, value: d.not_understood }))} />
        <small className="muted">{a.by_day.length ? `Understood per day, highest: ${Math.max(...a.by_day.map(d => d.understood))}` : ''}</small></div>
      <div className="grid2">
        <div className="card stack"><h3>Understood, by app version</h3>
          <HBars testid="ai-versions" label="Share understood by app version" unit="%" share={false}
            items={a.by_version.map(v => ({ key: v.version, label: v.version, value: Math.round(v.success_pct ?? 0), sub: `${v.commands} commands` }))} /></div>
        <div className="card stack"><h3>Understood, by language</h3>
          <HBars testid="ai-languages" label="Share understood by language" unit="%" share={false}
            items={a.by_language.map(v => ({ key: v.language, label: languageLabel(v.language), value: Math.round(v.success_pct ?? 0), sub: `${v.commands} commands` }))} /></div>
      </div>
      <div className="card stack"><h3>When agents use it</h3>
        <Heatmap rows={a.heatmap} caption={m => `AI commands by day and hour (Malaysia time). Darker = more. Busiest hour: ${m}.`} /></div>
      <h3>By agent</h3>
      {a.list === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : a.list.length === 0 ? <p className="muted">No commands in this period.</p> : (
        <div className="tablewrap dash-table mkt-table"><table data-testid="ai-agents">
          <thead><tr><th>Agent</th><th>Commands</th><th>Not understood</th><th>Understood</th><th>Last used</th></tr></thead>
          <tbody>{a.list.map(x => (
            <tr key={x.user_id}><td><AgentLink id={x.user_id} email={x.email} name={x.name} /></td><td>{fmtNum(x.commands)}</td>
              <td>{fmtNum(x.not_understood)}</td><td>{fmtPct0(x.success_pct)}</td><td className="small">{fmtTime(x.last_at)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Limit>The main app records each command and whether it understood it — not the words. Seeing what agents asked (to improve the AI)
        needs a main-app change that keeps the text without personal details (task M6).</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 61 Marketing Studio
function StudioTab({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const { data: s, err, busy, load } = useLoad(() => api.studioUsage(range.from, range.to), [api, range.from, range.to]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  return (
    <div className="stack" data-testid="c-studio">
      <Head title="Marketing Studio" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Studio opened" value={fmtNum(s.opened)} sub={`${fmtNum(s.agents)} agents`} />
        <Stat label="Posters made" value={fmtNum(s.created)} sub={`${fmtNum(s.makers)} agents`} />
        <Stat label="Saved" value={fmtNum(s.saved)} />
        <Stat label="Shared" value={fmtNum(s.shared)} sub={s.share_pct === null ? undefined : `${fmtPct0(s.share_pct)} of posters made`} />
      </div>
      <div className="card stack"><h3>Posters made per day</h3>
        <Bars testid="studio-days" label="Posters made per day" items={s.by_day.map(d => ({ label: d.day, value: d.created }))} /></div>
      <h3>By agent</h3>
      {s.list === null || !can(me.role, 'viewMarketAgents') ? <Hidden what="The list (it names agents) is" /> : s.list.length === 0 ? <p className="muted">Nobody used the Studio in this period.</p> : (
        <div className="tablewrap dash-table mkt-table"><table data-testid="studio-agents">
          <thead><tr><th>Agent</th><th>Opened</th><th>Made</th><th>Saved</th><th>Shared</th><th>Last used</th></tr></thead>
          <tbody>{s.list.map(x => (
            <tr key={x.user_id}><td><AgentLink id={x.user_id} email={x.email} name={x.name} /></td><td>{fmtNum(x.opened)}</td><td>{fmtNum(x.created)}</td>
              <td>{fmtNum(x.saved)}</td><td>{fmtNum(x.shared)}</td><td className="small">{fmtTime(x.last_at)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Limit>From the main app's own usage counts: Studio opened, poster made, saved to the phone and shared. The posters themselves stay on the agents' phones.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- Export (Owner + Compliance)
function ContentExport({ range }: { range: Range }) {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try { const r = await exportContent(api, me.email, format, range.from, range.to); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="row">
      <small className="muted">Report for {range.from} to {range.to}:</small>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="c-pdf">{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="c-xlsx">{busy === 'xlsx' ? 'Making…' : 'Excel'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="c-export-msg">{msg.text}</small>}
    </div>
  );
}
