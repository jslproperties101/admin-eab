// AdminBatch011 — Money (features 10, 2, 40, 33, 34), one screen with tabs. Owner, Admin and Compliance can see it;
// only the Owner can add or void entries and change prices, limits and settings (the database checks every time).
//   Ledger      Billing & Expenses: what is paid for the app and any money received. Never deleted: void with a reason.
//   Google      calls the main app counted per Google product, and the estimated bill
//   Alerts      warn before a monthly / daily limit or the free allowance is used up
//   Profit      received minus paid, month by month
//   Per user    money paid per active agent, month by month and by category
//   Prices      Google prices, free allowance, US$ → RM rate and a monthly spending warning
//   Agency      AdminBatch014: agency licences sold outside the app — invoices (FPX link, card link, or marked paid by bank
//               transfer), payments that could not be applied, and the agency prices
//   Tokens      main-app Batch D: Ai Buddy Tokens and Oneharta lookups — spend per day, lookups that need settling, agents'
//               balances and token history, and (Owner) adding or taking tokens with a reason
import { ReactNode, useState } from 'react';
import { MoneyTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { AgencyInvoice, AgencyInvoiceMade, AgencyPlan, AgencyPriceRow, ApiProduct, ApiSku, LedgerCategory, LedgerEntry, LedgerKind, NewLedgerEntry, WorkspaceRow } from '../api/admin';
import { todayKL } from '../admin/health';
import { Range, fmtNum, fmtPct0, presetRange } from '../admin/dash';
import { monthLabel } from '../admin/market';
import {
  CURRENCIES, LEVEL_LABEL, addMonths, categoriesFor, categoryLabel, fmtMyr, fmtUsd, googleNameLabel, ledgerProblems, levelTag, monthOf, toMyr, usedPct,
} from '../admin/money';
import { fmtTime } from '../export/reports';
import { exportMoney } from '../export/money';
import { AgentLink, Head, RangePicker, Stat, useLoad } from './Dashboards';
import { Bars, HBars } from './charts';
import { ConfirmDialog, ErrorBox, Loading } from './ui';
import { TokensTab } from './MoneyTokens';

const TABS: { k: MoneyTab; label: string }[] = [
  { k: 'ledger', label: 'Billing & expenses' }, { k: 'google', label: 'Google API' }, { k: 'alerts', label: 'Quota alerts' },
  { k: 'pnl', label: 'Profit & loss' }, { k: 'cost', label: 'Cost per user' }, { k: 'prices', label: 'Prices & settings' },
  { k: 'agency', label: 'Agency licences' }, { k: 'tokens', label: 'Tokens & lookups' },
];
type Confirm = null | { title: string; body: ReactNode; label: string; danger?: boolean; run: (reason: string) => Promise<void> };
const Limit = ({ children }: { children: ReactNode }) => <p className="notice small" data-testid="limit">{children}</p>;

export function MoneyScreen({ tab: first }: { tab: MoneyTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<MoneyTab>(first);
  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">Money</h1>
        {can(me.role, 'export') && <MoneyExport />}
      </div>
      <div className="tabs" role="group" aria-label="Money">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`mtab2-${t.k}`}>{t.label}</button>)}
      </div>
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'google' && <GoogleTab />}
      {tab === 'alerts' && <AlertsTab />}
      {tab === 'pnl' && <PnlTab />}
      {tab === 'cost' && <CostTab />}
      {tab === 'prices' && <PricesTab />}
      {tab === 'agency' && <AgencyTab />}
      {tab === 'tokens' && <TokensTab />}
      {!can(me.role, 'editMoney') && <p className="notice small" data-testid="money-readonly">Only the Owner can add or void entries and change prices or settings.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 10 Billing & expenses (ledger)
function LedgerTab() {
  const { api, me } = useAdmin();
  const [range, setRange] = useState<Range>(() => presetRange('365', todayKL()));
  const [kind, setKind] = useState<LedgerKind | null>(null);
  const [voided, setVoided] = useState(false);
  const { data: l, err, busy, load } = useLoad(() => api.ledger(range.from, range.to, kind, voided), [api, range.from, range.to, kind, voided]);
  const [adding, setAdding] = useState(false);
  const [c, setC] = useState<Confirm>(null);
  const [note, setNote] = useState<string | null>(null);
  const owner = can(me.role, 'editMoney');
  const thisMonth = monthOf(todayKL());
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!l) return <Loading />;
  return (
    <div className="stack" data-testid="money-ledger">
      <Head title="Billing & expenses" onRefresh={() => void load()} busy={busy}>
        {owner && <button className="btn small gold" onClick={() => setAdding(a => !a)} data-testid="ledger-new">{adding ? 'Close' : 'Add entry'}</button>}
      </Head>
      <RangePicker range={range} onChange={setRange} />
      <div className="stats">
        <Stat label="Paid" value={fmtMyr(l.expenses_myr)} />
        <Stat label="Received" value={fmtMyr(l.income_myr)} />
        <Stat label="Net" value={fmtMyr(l.income_myr - l.expenses_myr)} level={l.income_myr - l.expenses_myr < 0 ? 'amber' : 'ok'} />
        <Stat label="Voided entries" value={fmtNum(l.voided)} sub="kept, not counted" />
      </div>
      {adding && <LedgerForm onDone={() => { setAdding(false); void load(); }} />}
      {owner && (
        <div className="row"><span className="spacer" />
          <button className="btn small" data-testid="ledger-repeat" onClick={() => setC({
            title: `Copy monthly bills into ${monthLabel(thisMonth.slice(0, 7))}`,
            body: <p>Every “repeat monthly” entry of {monthLabel(addMonths(thisMonth, -1).slice(0, 7))} is entered again for this month (same amount, currency and rate).
              Entries already copied are skipped. You can void any copy that is not right.</p>,
            label: 'Copy entries',
            run: async reason => { const r = await api.ledgerRepeat(thisMonth, reason); setC(null); setNote(`${r.copied} entr${r.copied === 1 ? 'y' : 'ies'} copied into ${monthLabel(thisMonth.slice(0, 7))}.`); await load(); } })}>Copy monthly bills to this month</button>
          {note && <small role="status" data-testid="ledger-note">{note}</small>}
        </div>
      )}
      <div className="card stack">
        <h3>By category</h3>
        <HBars testid="ledger-categories" label="Money paid and received by category" items={l.by_category.map(x => ({
          key: `${x.kind}/${x.category}`, label: <>{categoryLabel(x.category)}{x.kind === 'income' ? <span className="tag ok"> received</span> : null}</>,
          value: Math.round(x.amount_myr), sub: `${x.entries} entr${x.entries === 1 ? 'y' : 'ies'}` }))} unit="RM" />
      </div>
      <div className="row">
        <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
          {([[null, 'All'], ['expense', 'Paid'], ['income', 'Received']] as const).map(([k, t]) =>
            <button key={String(k)} aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`lkind-${k ?? 'all'}`}>{t}</button>)}
        </div>
        <label className="choice"><input type="checkbox" checked={voided} onChange={e => setVoided(e.target.checked)} data-testid="ledger-voided" /> Show voided</label>
      </div>
      {l.entries.length === 0 ? <p className="muted">No entries in this period.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="ledger-list">
            <thead><tr><th>Month</th><th>Entry</th><th>Category</th><th>Amount</th><th>In RM</th><th /></tr></thead>
            <tbody>{l.entries.map(e => <LedgerRow key={e.id} e={e} owner={owner} onVoid={() => setC({
              title: `Void ${e.ref}`, danger: true,
              body: <p>{e.payee} · {fmtMyr(e.amount_myr)}. The entry stays in the ledger marked “void” and is no longer counted. Enter it again if the
                amount or details were wrong.</p>,
              label: 'Void entry', run: async reason => { await api.ledgerVoid(e.id, reason); setC(null); await load(); } })} />)}</tbody>
          </table>
        </div>
      )}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
      <Limit>Entries are never deleted or changed, so the ledger can be shown to an auditor. Foreign-currency entries keep the rate typed in, so the RM
        amount never moves later. Subscription income will appear here once subscriptions are built in the main app.</Limit>
    </div>
  );
}

function LedgerRow({ e, owner, onVoid }: { e: LedgerEntry; owner: boolean; onVoid: () => void }) {
  const off = !!e.voided_at;
  return (
    <tr className={off ? 'muted' : ''} data-testid="ledger-row">
      <td className="small">{monthLabel(e.period_month.slice(0, 7))}<br /><small className="muted">paid {e.paid_on}</small></td>
      <td><b className="code">{e.ref}</b> {e.recurring && <span className="tag">monthly</span>} {off && <span className="tag red">void</span>}<br />
        {e.payee}{e.description ? <small className="muted"> · {e.description}</small> : null}{e.invoice_ref ? <small className="muted"> · {e.invoice_ref}</small> : null}
        {off && <><br /><small className="muted">Void: {e.void_reason} · {e.voided_by_email}</small></>}
        {e.repeat_ref && <><br /><small className="muted">copied from {e.repeat_ref}</small></>}</td>
      <td className="small">{categoryLabel(e.category)}{e.kind === 'income' ? <><br /><span className="tag ok">received</span></> : null}</td>
      <td className="small">{e.currency} {Number(e.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}{e.currency !== 'MYR' ? <><br /><small className="muted">at {e.fx_to_myr}</small></> : null}</td>
      <td><b>{e.kind === 'income' ? '+' : ''}{fmtMyr(e.amount_myr)}</b></td>
      <td>{owner && !off && <button className="btn small" onClick={onVoid} data-testid="ledger-void">Void</button>}</td>
    </tr>
  );
}

function LedgerForm({ onDone }: { onDone: () => void }) {
  const { api } = useAdmin();
  const today = todayKL();
  const [f, setF] = useState<NewLedgerEntry>({ kind: 'expense', category: 'supabase', payee: '', description: '', amount: 0, currency: 'MYR', fx_to_myr: null,
    paid_on: today, period_month: monthOf(today), recurring: false, invoice_ref: '' });
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const entry = { ...f, amount: Number(amount) };
  const problems = ledgerProblems(entry, today);
  const save = async () => {
    setTouched(true); if (problems.length) return;
    setBusy(true); setErr(null);
    try { await api.ledgerAdd({ ...entry, fx_to_myr: f.currency === 'MYR' ? null : f.fx_to_myr }); onDone(); } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="ledger-form">
      <h3>New entry</h3>
      <div className="tabs" role="group" aria-label="Paid or received" style={{ margin: 0 }}>
        <button aria-pressed={f.kind === 'expense'} onClick={() => setF({ ...f, kind: 'expense', category: 'supabase' })} data-testid="lf-expense">Money paid</button>
        <button aria-pressed={f.kind === 'income'} onClick={() => setF({ ...f, kind: 'income', category: 'developer_partner' })} data-testid="lf-income">Money received</button>
      </div>
      <div className="filters">
        <label className="field"><span>Category</span>
          <select value={f.category} onChange={e => setF({ ...f, category: e.target.value as LedgerCategory })} data-testid="lf-category">
            {categoriesFor(f.kind).map(k => <option key={k} value={k}>{categoryLabel(k)}</option>)}</select></label>
        <label className="field"><span>{f.kind === 'income' ? 'Who paid' : 'Paid to'}</span>
          <input value={f.payee} onChange={e => setF({ ...f, payee: e.target.value })} maxLength={200} data-testid="lf-payee" /></label>
        <label className="field"><span>Amount</span>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="lf-amount" /></label>
        <label className="field"><span>Currency</span>
          <select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} data-testid="lf-currency">
            {CURRENCIES.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        {f.currency !== 'MYR' && <label className="field"><span>RM for 1 {f.currency} (from your bank or card statement)</span>
          <input inputMode="decimal" value={f.fx_to_myr ?? ''} onChange={e => setF({ ...f, fx_to_myr: e.target.value === '' ? null : Number(e.target.value.replace(/[^0-9.]/g, '')) })} data-testid="lf-fx" /></label>}
        <label className="field"><span>Date paid</span><input type="date" value={f.paid_on} onChange={e => setF({ ...f, paid_on: e.target.value, period_month: monthOf(e.target.value || today) })} data-testid="lf-paid" /></label>
        <label className="field"><span>For the month of</span><input type="month" value={(f.period_month ?? monthOf(today)).slice(0, 7)} onChange={e => setF({ ...f, period_month: e.target.value ? `${e.target.value}-01` : monthOf(f.paid_on) })} data-testid="lf-month" /></label>
        <label className="field"><span>Invoice / receipt no. (optional)</span><input value={f.invoice_ref ?? ''} onChange={e => setF({ ...f, invoice_ref: e.target.value })} maxLength={120} /></label>
      </div>
      <label className="field"><span>Note (optional)</span><input value={f.description ?? ''} onChange={e => setF({ ...f, description: e.target.value })} maxLength={2000} data-testid="lf-note" /></label>
      <label className="choice"><input type="checkbox" checked={f.recurring} onChange={e => setF({ ...f, recurring: e.target.checked })} data-testid="lf-recurring" /> Repeat monthly (can be copied to next month in one tap)</label>
      {entry.amount > 0 && (f.currency === 'MYR' || Number(f.fx_to_myr) > 0) && <p className="small" data-testid="lf-myr">Saved as <b>{fmtMyr(toMyr(entry.amount, f.currency, f.fx_to_myr))}</b></p>}
      {touched && problems.length > 0 && <ul className="error small" data-testid="lf-problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={busy} onClick={() => void save()} data-testid="lf-save">{busy ? 'Saving…' : 'Save entry'}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- 2 Google API usage & cost
function GoogleTab() {
  const { api } = useAdmin();
  const [months, setMonths] = useState(6);
  const { data: u, err, busy, load } = useLoad(() => api.apiUsage(months), [api, months]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!u) return <Loading />;
  const rm = (usd: number | null | undefined, myr: number | null | undefined) => (u.usd_myr ? fmtMyr(myr) : `${fmtUsd(usd)}`);
  return (
    <div className="stack" data-testid="money-google">
      <Head title="Google API usage & cost" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Months" style={{ margin: 0 }}>
          {[3, 6, 12].map(n => <button key={n} aria-pressed={months === n} onClick={() => setMonths(n)} data-testid={`gm-${n}`}>{n} months</button>)}
        </div>
      </Head>
      <div className="stats">
        <Stat label="Calls this month" value={fmtNum(u.products.reduce((s, p) => s + p.month_calls, 0))} sub={`day ${u.days_passed} of ${u.days_in_month}`} />
        <Stat label="Estimated bill so far" value={rm(u.month_usd, u.month_myr)} sub={u.usd_myr ? fmtUsd(u.month_usd) : 'set the US$ → RM rate in Prices'} />
        <Stat label="Projected for the month" value={rm(u.projected_usd, u.projected_myr)} sub="at this month's pace" />
        <Stat label="Alerts" value={fmtNum(u.alerts)} level={u.alerts ? 'amber' : 'ok'} />
      </div>
      <div className="card stack">
        <h3>Estimated bill per month</h3>
        <Bars testid="google-months" label="Estimated Google bill per month (US cents)" items={u.by_month.map(m => ({ label: monthLabel(m.month), value: Math.round((m.usd ?? 0) * 100) }))} />
        <small className="muted">{u.by_month.map(m => `${monthLabel(m.month)}: ${fmtNum(m.calls)} calls, ${fmtUsd(m.usd)}`).slice(-3).join(' · ')}</small>
      </div>
      <h3>This month by product</h3>
      <div className="tablewrap dash-table mkt-table"><table data-testid="google-products">
        <thead><tr><th>Product</th><th>Calls</th><th>Free a month</th><th>Price / 1,000</th><th>Bill so far</th><th>Projected</th></tr></thead>
        <tbody>{u.products.map(p => (
          <tr key={p.sku}><td>{p.label}<br /><small className="muted">{p.names.map(googleNameLabel).join(', ')}</small></td>
            <td>{fmtNum(p.month_calls)}</td><td>{p.free_per_month === null ? '—' : fmtNum(p.free_per_month)}</td>
            <td>{p.price_per_1000 === null ? <span className="tag amber">not set</span> : fmtUsd(p.price_per_1000)}</td>
            <td>{p.price_per_1000 === null ? '—' : fmtUsd(p.month_usd)}</td><td>{p.price_per_1000 === null ? '—' : fmtUsd(p.projected_usd)}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="grid2">
        <div className="card stack"><h3>Calls per day (last 30 days)</h3>
          <Bars testid="google-days" label="Google calls per day" items={u.by_day.map(d => ({ label: d.day, value: d.calls }))} /></div>
        <div className="card stack"><h3>What the app called</h3>
          <HBars testid="google-names" label="Google calls this month by kind" items={u.by_name.map(n => ({ key: n.name, label: googleNameLabel(n.name), value: n.calls,
            sub: `${n.agents} agents${n.failures ? ` · ${n.failures} failed` : ''}` }))} /></div>
      </div>
      <h3>Agents using the most this month</h3>
      {u.top_agents.length === 0 ? <p className="muted">No Google calls this month.</p> : (
        <div className="tablewrap"><table className="small" data-testid="google-agents">
          <thead><tr><th>Agent</th><th>Calls</th></tr></thead>
          <tbody>{u.top_agents.map(a => <tr key={a.user_id}><td><AgentLink id={a.user_id} email={a.email} name={a.name} /></td><td>{fmtNum(a.calls)}</td></tr>)}</tbody>
        </table></div>
      )}
      <Limit>From the calls the main app counted, so it is an estimate: Google's own bill (Google Cloud console → Billing) is the real figure — enter it
        under Billing &amp; expenses each month. Bill = calls above the free monthly allowance × the price per 1,000 (Google's cheaper rate above 100,000
        calls is not applied).{u.unpriced_calls ? ` ${fmtNum(u.unpriced_calls)} calls this month have no price yet (set it in Prices).` : ''}</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 40 Quota alerts
function AlertsTab() {
  const { api, me } = useAdmin();
  const { data: u, err, busy, load } = useLoad(() => api.apiUsage(1), [api]);
  const [edit, setEdit] = useState<ApiProduct | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!u) return <Loading />;
  const owner = can(me.role, 'editMoney');
  return (
    <div className="stack" data-testid="money-alerts">
      <Head title="Quota alerts (this month)" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Limit reached" value={fmtNum(u.products.filter(p => p.level === 'red').length)} level={u.products.some(p => p.level === 'red') ? 'red' : 'ok'} />
        <Stat label="Watch" value={fmtNum(u.products.filter(p => p.level === 'amber').length)} level={u.products.some(p => p.level === 'amber') ? 'amber' : 'ok'} />
        <Stat label="Month so far" value={`${u.days_passed} of ${u.days_in_month} days`} />
      </div>
      <div className="stack" data-testid="alert-list">
        {u.products.map(p => {
          const lim = usedPct(Math.max(p.month_calls, p.projected), p.monthly_limit), free = usedPct(Math.max(p.month_calls, p.projected), p.free_per_month);
          return (
            <div key={p.sku} className="card stack" data-testid={`alert-${p.sku}`}>
              <div className="row"><b className="spacer">{p.label}</b><span className={`tag ${levelTag(p.level)}`}>{LEVEL_LABEL[p.level]}</span></div>
              <small className="muted">{fmtNum(p.month_calls)} calls so far · {fmtNum(p.projected)} expected by month end · {fmtNum(p.today_calls)} today</small>
              {p.reasons.length > 0 && <ul className="small" style={{ margin: 0 }}>{p.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
              <div className="row small">
                <span>Monthly limit: <b>{p.monthly_limit === null ? 'none' : `${fmtNum(p.monthly_limit)}${lim !== null ? ` (${lim}% expected)` : ''}`}</b></span>
                <span>Daily limit: <b>{p.daily_limit === null ? 'none' : fmtNum(p.daily_limit)}</b></span>
                <span>Free a month: <b>{p.free_per_month === null ? '—' : `${fmtNum(p.free_per_month)}${free !== null ? ` (${free}% expected)` : ''}`}</b></span>
                <span>Warn at <b>{p.alert_pct}%</b></span>
              </div>
              {owner && p.sku !== 'other' && <div className="row"><span className="spacer" /><button className="btn small" onClick={() => setEdit(p)} data-testid={`alert-edit-${p.sku}`}>Change limits</button></div>}
            </div>
          );
        })}
      </div>
      {edit && <SkuDialog sku={edit} what="limits" onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
      <Limit>Set the same limits as in Google Cloud console → APIs &amp; Services → Quotas, so Admin EAB warns before Google stops the maps. “Watch” = on course
        for the warning % of a limit or of the free allowance; “Limit reached” = a monthly or daily limit is used up. Days are Malaysia days.</Limit>
    </div>
  );
}

/** Owner: change a Google product's price, free allowance, limits or warning % (reason + confirm). */
function SkuDialog({ sku, what, onClose, onSaved }: { sku: ApiSku | ApiProduct; what: 'limits' | 'price'; onClose: () => void; onSaved: () => void }) {
  const { api } = useAdmin();
  const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  const [v, setV] = useState({ price_per_1000: str(sku.price_per_1000), free_per_month: str(sku.free_per_month), monthly_limit: str(sku.monthly_limit),
    daily_limit: str(sku.daily_limit), alert_pct: str(sku.alert_pct) });
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const keys = what === 'price' ? (['price_per_1000', 'free_per_month'] as const) : (['monthly_limit', 'daily_limit', 'alert_pct'] as const);
  const LABEL = { price_per_1000: 'Price per 1,000 calls (US$; empty = not set)', free_per_month: 'Free calls a month (empty = none)',
    monthly_limit: 'Monthly limit (empty = none)', daily_limit: 'Daily limit (empty = none)', alert_pct: 'Warn at % (10-100)' };
  const patch = Object.fromEntries(keys.filter(k => v[k] !== str(sku[k])).map(k => [k, v[k]]));
  const bad = keys.some(k => v[k] !== '' && !(Number(v[k]) >= 0)) || (v.alert_pct !== '' && (Number(v.alert_pct) < 10 || Number(v.alert_pct) > 100));
  if (step === 'confirm') return (
    <ConfirmDialog title={`Change ${sku.label}`} confirmLabel="Save" onClose={onClose}
      body={<ul>{Object.entries(patch).map(([k, x]) => <li key={k}>{LABEL[k as keyof typeof LABEL]}: <b>{x === '' ? 'none' : x}</b></li>)}</ul>}
      onConfirm={async reason => { await api.apiSkuSet(sku.sku, patch, reason); onSaved(); }} />
  );
  return (
    <div className="overlay" role="presentation">
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label={`Change ${sku.label}`} data-testid="sku-dialog">
        <h2>{sku.label}</h2>
        {keys.map(k => <label key={k} className="field"><span>{LABEL[k]}</span>
          <input inputMode="decimal" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value.replace(/[^0-9.]/g, '') })} data-testid={`sku-${k}`} /></label>)}
        <div className="row"><button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
          <button className="btn gold" disabled={bad || Object.keys(patch).length === 0} onClick={() => setStep('confirm')} data-testid="sku-next">Continue</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 33 Profit & loss
function PnlTab() {
  const { api } = useAdmin();
  const [months, setMonths] = useState(12);
  const { data: s, err, busy, load } = useLoad(() => api.moneySummary(months), [api, months]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  return (
    <div className="stack" data-testid="money-pnl">
      <Head title="Profit & loss" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Months" style={{ margin: 0 }}>
          {[6, 12, 24].map(n => <button key={n} aria-pressed={months === n} onClick={() => setMonths(n)} data-testid={`pm-${n}`}>{n} months</button>)}
        </div>
      </Head>
      <div className="stats">
        <Stat label="Received" value={fmtMyr(s.income)} sub={`last ${s.months} months`} />
        <Stat label="Paid" value={fmtMyr(s.expenses)} />
        <Stat label={s.net < 0 ? 'Loss' : 'Profit'} value={fmtMyr(s.net)} level={s.net < 0 ? 'red' : 'ok'} />
        <Stat label="This month" value={fmtMyr(s.this_month.net)} sub={s.this_month.over_budget ? 'over the monthly warning' : `paid ${fmtMyr(s.this_month.expenses)}`}
          level={s.this_month.over_budget ? 'amber' : undefined} />
      </div>
      <div className="grid2">
        <div className="card stack"><h3>Paid per month (RM)</h3><Bars testid="pnl-paid" label="Money paid per month (RM)" items={s.by_month.map(m => ({ label: monthLabel(m.month), value: Math.round(m.expenses) }))} /></div>
        <div className="card stack"><h3>Received per month (RM)</h3><Bars testid="pnl-received" label="Money received per month (RM)" items={s.by_month.map(m => ({ label: monthLabel(m.month), value: Math.round(m.income) }))} /></div>
      </div>
      <div className="tablewrap dash-table mkt-table"><table data-testid="pnl-table">
        <thead><tr><th>Month</th><th>Received</th><th>Paid</th><th>Profit / loss</th><th>Google (estimate)</th></tr></thead>
        <tbody>{[...s.by_month].reverse().map(m => (
          <tr key={m.month}><td>{monthLabel(m.month)}{m.over_budget && <> <span className="tag amber">over warning</span></>}</td>
            <td>{fmtMyr(m.income)}</td><td>{fmtMyr(m.expenses)}</td>
            <td><span className={`tag ${m.net < 0 ? 'red' : 'ok'}`}>{fmtMyr(m.net)}</span></td>
            <td className="small">{m.google_usd === null || m.google_usd === undefined ? '—' : `${s.usd_myr ? fmtMyr(m.google_myr) : fmtUsd(m.google_usd)}${m.google_billed ? ' (bill entered)' : m.google_usd > 0 ? ' · not yet in the ledger' : ''}`}</td></tr>
        ))}</tbody>
      </table></div>
      <Limit>From the Billing &amp; expenses ledger (voided entries left out). The Google column is the app's estimate, shown so a month without the Google
        bill entered is easy to spot. Subscription revenue is not built in the main app yet, so it is not in “received”.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- 34 Cost per user
function CostTab() {
  const { api } = useAdmin();
  const [months, setMonths] = useState(12);
  const { data: s, err, busy, load } = useLoad(() => api.moneySummary(months), [api, months]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  const withAgents = s.by_month.filter(m => m.active > 0);
  return (
    <div className="stack" data-testid="money-cost">
      <Head title="Cost per user" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Months" style={{ margin: 0 }}>
          {[6, 12, 24].map(n => <button key={n} aria-pressed={months === n} onClick={() => setMonths(n)} data-testid={`cm-${n}`}>{n} months</button>)}
        </div>
      </Head>
      <div className="stats">
        <Stat label="This month, per active agent" value={fmtMyr(s.this_month.cost_per_active)} sub={`${fmtNum(s.this_month.active)} active agents`} />
        <Stat label="Average per agent per month" value={fmtMyr(s.cost_per_active_avg)} sub={`last ${s.months} months`} />
        <Stat label="Average active agents" value={s.average_active === null ? '—' : fmtNum(s.average_active, 1)} />
      </div>
      <div className="card stack"><h3>Cost per active agent (RM)</h3>
        <Bars testid="cost-months" label="Money paid per active agent per month (RM)" items={withAgents.map(m => ({ label: monthLabel(m.month), value: Math.round(m.cost_per_active ?? 0) }))} /></div>
      <div className="grid2">
        <div className="card stack"><h3>By category (per agent per month)</h3>
          <HBars testid="cost-categories" label="Cost per agent per month by category" unit="RM" share={false}
            items={s.by_category.filter(c => c.kind === 'expense').map(c => ({ key: c.category, label: categoryLabel(c.category), value: Number(c.per_active ?? 0), sub: `total ${fmtMyr(c.amount_myr)}` }))} /></div>
        <div className="card stack"><h3>Month by month</h3>
          <table className="small" data-testid="cost-table"><thead><tr><th>Month</th><th>Paid</th><th>Active agents</th><th>Per agent</th></tr></thead>
            <tbody>{[...s.by_month].reverse().map(m => <tr key={m.month}><td>{monthLabel(m.month)}</td><td>{fmtMyr(m.expenses)}</td><td>{fmtNum(m.active)}</td><td>{fmtMyr(m.cost_per_active)}</td></tr>)}</tbody></table></div>
      </div>
      <Limit>Active agent = an agent who used the app that month (the same rule as the dashboards). Money paid comes from the ledger, so the figure is only
        as complete as the bills entered there.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- Prices & settings
function PricesTab() {
  const { api, me } = useAdmin();
  const { data: m, err, busy, load } = useLoad(() => api.moneySettings(), [api]);
  const [edit, setEdit] = useState<ApiSku | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [c, setC] = useState<Confirm>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!m) return <Loading />;
  const owner = can(me.role, 'editMoney');
  const st = m.settings;
  const r = rate ?? (st.usd_myr === null ? '' : String(st.usd_myr)), b = budget ?? (st.monthly_budget_myr === null ? '' : String(st.monthly_budget_myr));
  const changed = r !== (st.usd_myr === null ? '' : String(st.usd_myr)) || b !== (st.monthly_budget_myr === null ? '' : String(st.monthly_budget_myr));
  return (
    <div className="stack" data-testid="money-prices">
      <Head title="Prices & settings" onRefresh={() => void load()} busy={busy} />
      <div className="card boxed stack">
        <div className="filters">
          <label className="field"><span>RM for US$ 1 (used for Google estimates)</span>
            <input inputMode="decimal" disabled={!owner} value={r} onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ms-rate" placeholder="not set" /></label>
          <label className="field"><span>Warn when a month's spending is over (RM)</span>
            <input inputMode="decimal" disabled={!owner} value={b} onChange={e => setBudget(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ms-budget" placeholder="no warning" /></label>
        </div>
        {owner && <div className="row"><small className="muted spacer">Last changed {fmtTime(st.updated_at)}</small>
          <button className="btn gold small" disabled={!changed || (r !== '' && !(Number(r) > 0)) || (b !== '' && !(Number(b) > 0))} data-testid="ms-save" onClick={() => setC({
            title: 'Change money settings', body: <p>US$ 1 = RM {r || '(not set)'} · monthly warning {b ? `RM ${b}` : 'off'}</p>, label: 'Save',
            run: async reason => { await api.moneySettingsSet({ usd_myr: r, monthly_budget_myr: b }, reason); setRate(null); setBudget(null); setC(null); await load(); } })}>Save</button></div>}
      </div>
      <h3>Google products</h3>
      <div className="tablewrap dash-table mkt-table"><table data-testid="sku-table">
        <thead><tr><th>Product</th><th>Price / 1,000</th><th>Free a month</th><th>Limits</th><th /></tr></thead>
        <tbody>{m.skus.map(k => (
          <tr key={k.sku}><td>{k.label}<br /><small className="muted">{k.names.map(googleNameLabel).join(', ')}</small></td>
            <td>{k.price_per_1000 === null ? <span className="tag amber">not set</span> : fmtUsd(k.price_per_1000)}</td>
            <td>{k.free_per_month === null ? '—' : fmtNum(k.free_per_month)}</td>
            <td className="small">{k.monthly_limit ? `${fmtNum(k.monthly_limit)} / month` : '—'}{k.daily_limit ? ` · ${fmtNum(k.daily_limit)} / day` : ''} · warn {fmtPct0(k.alert_pct)}</td>
            <td>{owner && <button className="btn small" onClick={() => setEdit(k)} data-testid={`sku-edit-${k.sku}`}>Change price</button>}</td></tr>
        ))}</tbody>
      </table></div>
      {edit && <SkuDialog sku={edit} what="price" onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} onConfirm={c.run} onClose={() => setC(null)} />}
      <Limit>Starting prices were checked on 30 Oct 2026 (Google Maps Platform, Essentials): a map shown US$ 7 per 1,000 after 10,000 free a month;
        Geocoding US$ 5 per 1,000 after 10,000 free; loading the maps script is free. Google changes prices — check Google Cloud console → Billing and
        change them here. Products marked “not set” are counted but not priced.</Limit>
    </div>
  );
}

// ---------------------------------------------------------------- AdminBatch014 Agency licences
export const AGENCY_PLAN_LABEL: Record<AgencyPlan, string> = {
  agency_seat_monthly: 'Per agent, monthly', agency_seat_yearly: 'Per agent, yearly', agency_monthly: 'Whole agency, monthly', agency_yearly: 'Whole agency, yearly',
};
const sen = (n: number) => fmtMyr(n / 100);
/** RM text → sen; null when empty, NaN when not a valid amount of RM 1 or more. */
export const rmToSen = (t: string): number | null => { if (!t.trim()) return null; const x = Number(t); return x >= 1 && /^\d+(\.\d{1,2})?$/.test(t.trim()) ? Math.round(x * 100) : NaN; };
const copy = (t: string) => { void navigator.clipboard?.writeText(t); };
const cardLink = (url: string, i: AgencyInvoice) => `${url.replace(/\/+$/, '')}/functions/v1/billing-webhook?p=pay&i=${i.id}&t=${i.pay_token}`;

function AgencyTab() {
  const { api, me, conn } = useAdmin();
  const [status, setStatus] = useState<'open' | 'paid' | 'void' | null>(null);
  const { data: list, err, busy, load } = useLoad(() => Promise.all([api.agencyInvoices(status), api.agencyPrices(), api.agencyProblems()]), [api, status]);
  const [c, setC] = useState<Confirm>(null);
  const [raise, setRaise] = useState(false);
  const [made, setMade] = useState<AgencyInvoiceMade | null>(null);
  const [paid, setPaid] = useState<AgencyInvoice | null>(null);
  const [price, setPrice] = useState<AgencyPriceRow | null>(null);
  if (err) return <ErrorBox text={/could not find the function|PGRST202|404/i.test(err) ? 'Agency licences are not on this database yet (supabase/proposed/20261110100000_agency_licences.sql).' : err} onRetry={() => void load()} />;
  if (!list) return <Loading />;
  const [invoices, prices, problems] = list;
  const owner = can(me.role, 'editMoney');
  return (
    <div className="stack" data-testid="money-agency">
      <Head title="Agency licences" onRefresh={() => void load()} busy={busy}>
        {owner && <button className="btn gold small" data-testid="ag-raise" onClick={() => { setMade(null); setRaise(true); }}>Raise an invoice</button>}
      </Head>
      {made && <div className="card boxed stack" data-testid="ag-made">
        <b>Invoice {made.invoice.no}: {sen(made.invoice.amount_sen)} · {made.invoice.seats} agent{made.invoice.seats === 1 ? '' : 's'} · {made.invoice.days} days{made.env === 'sandbox' ? ' · sandbox' : ''}</b>
        {made.fpxUrl ? <div className="row"><small className="spacer mono">{made.fpxUrl}</small><button className="btn small" onClick={() => copy(made.fpxUrl!)}>Copy FPX link</button></div> : <small className="muted">FPX is not set up on the server yet.</small>}
        {made.cardUrl ? <div className="row"><small className="spacer mono">{made.cardUrl}</small><button className="btn small" onClick={() => copy(made.cardUrl!)}>Copy card link</button></div> : <small className="muted">Card payment is not set up on the server yet.</small>}
        <small className="muted">Send these links with your invoice. Paying either one starts or extends the agency's licence by itself; a bank transfer is marked paid below.</small>
      </div>}
      <div className="tabs" role="group" aria-label="Invoice status">
        {([null, 'open', 'paid', 'void'] as const).map(s => <button key={s ?? 'all'} aria-pressed={status === s} onClick={() => setStatus(s)}>{s ? { open: 'Open', paid: 'Paid', void: 'Void' }[s] : 'All'}</button>)}
      </div>
      <div className="tablewrap dash-table"><table data-testid="ag-invoices">
        <thead><tr><th>Invoice</th><th>Agency</th><th>Plan</th><th>Amount</th><th>Status</th><th /></tr></thead>
        <tbody>{invoices.length === 0 ? <tr><td colSpan={6} className="muted">No invoices.</td></tr> : invoices.map(i => (
          <tr key={i.id} data-testid="ag-invoice">
            <td><b>{i.no}</b><br /><small className="muted">{fmtTime(i.created_at)} · {i.origin === 'checkout' ? 'website checkout' : 'invoice'}{i.env === 'sandbox' ? ' · sandbox' : ''}</small></td>
            <td>{i.workspace}{i.bill_to ? <><br /><small className="muted">{i.bill_to}</small></> : null}</td>
            <td className="small">{AGENCY_PLAN_LABEL[i.plan]} · {i.seats} agent{i.seats === 1 ? '' : 's'} · {i.days} days</td>
            <td>{sen(i.amount_sen)}{i.amount_sen !== i.list_amount_sen ? <><br /><small className="muted">list {sen(i.list_amount_sen)}</small></> : null}</td>
            <td>{i.status === 'open' ? <span className="tag amber">open</span> : i.status === 'paid' ? <span className="tag green">paid</span> : <span className="tag">void</span>}
              {i.paid_via ? <><br /><small className="muted">{i.paid_via === 'manual' ? 'bank transfer' : i.paid_via.toUpperCase()} {i.paid_ref ?? ''}</small></> : null}
              {i.void_reason ? <><br /><small className="muted">{i.void_reason}</small></> : null}</td>
            <td className="row">{i.status === 'open' && <>
              {i.fpx_url && <button className="btn small" onClick={() => copy(i.fpx_url!)}>FPX link</button>}
              <button className="btn small" onClick={() => copy(cardLink(conn.supabaseUrl, i))}>Card link</button>
              {owner && <button className="btn small" data-testid="ag-mark-paid" onClick={() => setPaid(i)}>Mark paid</button>}
              {owner && <button className="btn small danger" data-testid="ag-void" onClick={() => setC({ title: `Void ${i.no}`, danger: true, label: 'Void',
                body: <p>The links on this invoice stop working. A payment that still arrives for it is recorded below for a refund.</p>,
                run: async reason => { await api.agencyInvoiceVoid(i.id, reason); setC(null); await load(); } })}>Void</button>}
            </>}</td>
          </tr>))}</tbody>
      </table></div>
      {problems.length > 0 && <div className="card boxed stack" data-testid="ag-problems">
        <b>Payments that were not applied — refund or follow up</b>
        {problems.map(p => <small key={p.id}>{fmtTime(p.received_at)} · {p.provider.toUpperCase()} {p.event_id} · {p.amount_sen === null ? '' : sen(p.amount_sen)} · {
          ({ 'wrong-amount': 'amount differs from the invoice', 'void-invoice': 'invoice was void', 'already-paid': 'invoice was already paid', 'unknown-invoice': 'no such invoice' } as Record<string, string>)[p.result] ?? p.result}</small>)}
      </div>}
      <h3>Agency prices</h3>
      <div className="tablewrap dash-table"><table data-testid="ag-prices">
        <thead><tr><th>Plan</th><th>Price</th><th>Covers</th><th>On sale</th><th /></tr></thead>
        <tbody>{prices.map(p => <tr key={p.plan}><td>{AGENCY_PLAN_LABEL[p.plan]}</td><td>{sen(p.amount_sen)} {p.style === 'seats' ? 'per agent' : ''} / {p.days} days</td>
          <td>{p.style === 'agency' ? `up to ${p.seats_included} agents` : 'each agent bought'}</td><td>{p.active ? 'yes' : 'no'}</td>
          <td>{owner && <button className="btn small" data-testid={`ag-price-${p.plan}`} onClick={() => setPrice(p)}>Change</button>}</td></tr>)}</tbody>
      </table></div>
      <Limit>Agency licences are sold outside the Android app only (website checkout, or these invoices): Google Play's rules do not allow other ways
        to pay inside the app in Malaysia. Prices start as sandbox placeholders — set them before any sale. Nothing renews by itself: send a new
        invoice before the licence ends.</Limit>
      {raise && <RaiseInvoice prices={prices} onClose={() => setRaise(false)} onMade={m => { setRaise(false); setMade(m); void load(); }} />}
      {paid && <MarkPaid inv={paid} onClose={() => setPaid(null)} onDone={() => { setPaid(null); void load(); }} />}
      {price && <AgencyPriceDialog p={price} onClose={() => setPrice(null)} onSaved={() => { setPrice(null); void load(); }} />}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

function RaiseInvoice({ prices, onClose, onMade }: { prices: AgencyPriceRow[]; onClose: () => void; onMade: (m: AgencyInvoiceMade) => void }) {
  const { api } = useAdmin();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<WorkspaceRow[]>([]);
  const [ws, setWs] = useState<WorkspaceRow | null>(null);
  const [plan, setPlan] = useState<AgencyPlan>('agency_seat_monthly');
  const [seats, setSeats] = useState('1');
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [billTo, setBillTo] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = prices.find(x => x.plan === plan);
  const n = p?.style === 'agency' ? (p.seats_included ?? 1) : Math.max(1, Math.min(500, Number(seats) || 1));
  const list = p ? (p.style === 'seats' ? p.amount_sen * n : p.amount_sen) : 0;
  const own = rmToSen(amount);
  const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = !!ws && !!p && p.active && okEmail && !Number.isNaN(own) && (p.style === 'agency' || /^\d+$/.test(seats));
  const search = async () => { setErr(null); try { setFound((await api.workspaces(q.trim() || null)).workspaces.slice(0, 20)); } catch (e) { setErr(errText(e)); } };
  if (confirm && ws && p) return (
    <ConfirmDialog title="Raise this invoice" confirmLabel="Raise invoice" onClose={onClose}
      body={<ul><li>{ws.name}</li><li>{AGENCY_PLAN_LABEL[plan]} · {n} agent{n === 1 ? '' : 's'} · {p.days} days</li>
        <li><b>{sen(own ?? list)}</b>{own !== null && own !== list ? ` (list ${sen(list)})` : ''}</li><li>Payer email: {email.trim()}</li></ul>}
      onConfirm={async reason => {
        if (!api.agencyInvoiceCreate) throw new Error('Not available in this build.');
        onMade(await api.agencyInvoiceCreate({ workspaceId: ws.id, plan, seats: p.style === 'seats' ? n : null, amountSen: own, payerEmail: email.trim(), billTo: billTo.trim(), note: note.trim(), reason }));
      }} />
  );
  return (
    <div className="overlay" role="presentation">
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Raise an agency invoice" data-testid="ag-raise-dialog">
        <h3>Raise an agency invoice</h3>
        <div className="row"><input className="spacer" placeholder="Agency or owner name / email" value={q} onChange={e => setQ(e.target.value)} data-testid="ag-ws-q" />
          <button className="btn small" onClick={() => void search()} data-testid="ag-ws-search">Find</button></div>
        {found.length > 0 && !ws && <div className="stack">{found.map(w => <button key={w.id} className="btn small" onClick={() => setWs(w)} data-testid="ag-ws-pick">{w.name} · {w.owner_email ?? '—'} · {w.members} member{w.members === 1 ? '' : 's'}</button>)}</div>}
        {ws && <div className="row"><b className="spacer">{ws.name}</b><button className="btn small" onClick={() => setWs(null)}>Change</button></div>}
        <label className="field"><span>Plan</span><select value={plan} onChange={e => setPlan(e.target.value as AgencyPlan)} data-testid="ag-plan">
          {prices.filter(x => x.active).map(x => <option key={x.plan} value={x.plan}>{AGENCY_PLAN_LABEL[x.plan]} — {sen(x.amount_sen)}{x.style === 'seats' ? ' per agent' : ''}</option>)}</select></label>
        {p?.style === 'seats' ? <label className="field"><span>Agents (seats)</span><input inputMode="numeric" value={seats} onChange={e => setSeats(e.target.value.replace(/\D/g, ''))} data-testid="ag-seats" /></label>
          : p && <small>Covers up to {p.seats_included} agents.</small>}
        <small>List price: <b>{sen(list)}</b> for {p?.days} days</small>
        <label className="field"><span>Amount to charge (RM) — empty = the list price</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ag-amount" /></label>
        <label className="field"><span>Payer email (Billplz needs one)</span><input inputMode="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="ag-email" /></label>
        <label className="field"><span>Bill to (company name, optional)</span><input value={billTo} onChange={e => setBillTo(e.target.value.slice(0, 300))} /></label>
        <label className="field"><span>Note (optional)</span><input value={note} onChange={e => setNote(e.target.value.slice(0, 500))} /></label>
        {err && <ErrorBox text={err} />}
        <div className="row"><span className="spacer" /><button className="btn small" onClick={onClose}>Cancel</button>
          <button className="btn gold small" disabled={!ready} onClick={() => setConfirm(true)} data-testid="ag-next">Next</button></div>
      </div>
    </div>
  );
}

function MarkPaid({ inv, onClose, onDone }: { inv: AgencyInvoice; onClose: () => void; onDone: () => void }) {
  const { api } = useAdmin();
  const [ref, setRef] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  if (step === 2) return (
    <ConfirmDialog title={`Mark ${inv.no} paid`} confirmLabel="Mark paid" onClose={onClose}
      body={<p>{sen(inv.amount_sen)} received by bank transfer, reference <b>{ref.trim()}</b>. The agency's licence starts or is extended by {inv.days} days.</p>}
      onConfirm={async reason => { const r = await api.agencyInvoiceMarkPaid(inv.id, ref.trim(), reason); if (r !== 'applied') throw new Error(`Not applied: ${r}`); onDone(); }} />
  );
  return (
    <div className="overlay" role="presentation">
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Mark paid" data-testid="ag-paid-dialog">
        <h3>Mark {inv.no} paid</h3>
        <small>Only after the money is in the bank account. {sen(inv.amount_sen)} from {inv.workspace}.</small>
        <label className="field"><span>Bank reference</span><input value={ref} onChange={e => setRef(e.target.value.slice(0, 100))} data-testid="ag-ref" /></label>
        <div className="row"><span className="spacer" /><button className="btn small" onClick={onClose}>Cancel</button>
          <button className="btn gold small" disabled={ref.trim().length < 3} onClick={() => setStep(2)} data-testid="ag-paid-next">Next</button></div>
      </div>
    </div>
  );
}

function AgencyPriceDialog({ p, onClose, onSaved }: { p: AgencyPriceRow; onClose: () => void; onSaved: () => void }) {
  const { api } = useAdmin();
  const [amount, setAmount] = useState((p.amount_sen / 100).toFixed(2));
  const [cover, setCover] = useState(String(p.seats_included ?? ''));
  const [active, setActive] = useState(p.active);
  const [step, setStep] = useState<1 | 2>(1);
  const s = rmToSen(amount);
  const ok = s !== null && !Number.isNaN(s) && (p.style === 'seats' || (Number(cover) >= 1 && Number(cover) <= 500));
  if (step === 2) return (
    <ConfirmDialog title={`Change ${AGENCY_PLAN_LABEL[p.plan]}`} confirmLabel="Save" onClose={onClose}
      body={<ul><li>{sen(s!)}{p.style === 'seats' ? ' per agent' : ''} / {p.days} days</li>{p.style === 'agency' && <li>covers up to {cover} agents</li>}<li>{active ? 'on sale' : 'not on sale'}</li>
        <li className="muted">Invoices already raised keep their amounts.</li></ul>}
      onConfirm={async reason => { await api.agencyPriceSet(p.plan, s!, p.style === 'agency' ? Number(cover) : null, active, reason); onSaved(); }} />
  );
  return (
    <div className="overlay" role="presentation">
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Agency price" data-testid="ag-price-dialog">
        <h3>{AGENCY_PLAN_LABEL[p.plan]}</h3>
        <label className="field"><span>Price (RM){p.style === 'seats' ? ' per agent' : ''} for {p.days} days</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ag-price-amount" /></label>
        {p.style === 'agency' && <label className="field"><span>Covers up to (agents)</span><input inputMode="numeric" value={cover} onChange={e => setCover(e.target.value.replace(/\D/g, ''))} /></label>}
        <label className="check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> On sale</label>
        <div className="row"><span className="spacer" /><button className="btn small" onClick={onClose}>Cancel</button>
          <button className="btn gold small" disabled={!ok} onClick={() => setStep(2)} data-testid="ag-price-next">Next</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Export (Owner + Compliance)
function MoneyExport() {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try { const r = await exportMoney(api, me.email, format); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="row">
      <small className="muted">Last 12 months:</small>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="money-pdf">{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="money-xlsx">{busy === 'xlsx' ? 'Making…' : 'Excel'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="money-export-msg">{msg.text}</small>}
    </div>
  );
}
