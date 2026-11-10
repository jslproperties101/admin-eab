// Main-app Batch D — Money › Tokens & lookups. Ai Buddy Tokens (agents buy them in the main app through Google Play) and the
// Oneharta lookups they pay for (3 tokens per Oneharta credit; one credit costs the company RM 1.25).
//   Spend           Oneharta credits used per Malaysia day and what they cost, tokens charged for them, tokens sold
//   Needs settling  lookups Oneharta never answered, or left pending for more than 10 minutes: their tokens are held until
//                   someone checks Oneharta's call log (oneharta.com › API › call log) and records what happened
//   Balances        every agent's tokens (test and real kept apart), their last 100 changes, and (Owner) add / take tokens
// The database checks the role and logs every change with its reason. Lookup results are never kept, so none show here.
import { useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { fmtMyr, fmtUsd } from '../admin/money';
import { LookupKind, LookupRow, LookupStatus, TokenBalanceRow, TokenEnv, TokenLedgerRow } from '../api/admin';
import { fmtTime } from '../export/reports';
import { Head, Stat, useLoad } from './Dashboards';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

export const RM_PER_CREDIT = 1.25;
export const KIND_LABEL: Record<LookupKind, string> = {
  infosearch: 'InfoSearch', ct_search: 'Land tax', company: 'Company', sale_search: 'Sale search', sale_unlock: 'Sale names',
  rental_search: 'Rental search', rental_unlock: 'Rental names',
};
const STATUS: Record<LookupStatus, [string, string]> = {
  pending: ['running', 'amber'], done: ['found', 'green'], empty: ['nothing found', ''], failed: ['failed, not charged', ''],
  unknown: ['no answer — settle', 'red'], refunded: ['refunded', ''],
};
const envTag = (e: TokenEnv) => (e === 'sandbox' ? <span className="tag">test</span> : <span className="tag green">real</span>);
const MISSING = /could not find the function|PGRST202|404/i;

export function TokensTab() {
  const { api, me } = useAdmin();
  const [days, setDays] = useState(30);
  const { data, err, busy, load } = useLoad(() => Promise.all([api.lookupSpend(days), api.lookups('attention'), api.lookups(null)]), [api, days]);
  const [settle, setSettle] = useState<LookupRow | null>(null);
  if (err) return <ErrorBox text={MISSING.test(err) ? 'Tokens and lookups are not on this database yet (main repo supabase/proposed/20261110300000_admin_lookups_tokens.sql, after the token and lookup files).' : err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const [spend, attention, recent] = data;
  const real = spend.by_day.filter(d => d.env === 'live'); const test = spend.by_day.filter(d => d.env === 'sandbox');
  const credits = (xs: typeof spend.by_day) => xs.reduce((s, d) => s + d.credits, 0);
  const sold = spend.tokens_sold.reduce((s, d) => s + (d.env === 'live' ? d.usd_cents : 0), 0);
  const settler = can(me.role, 'settleLookups');
  return (
    <div className="stack" data-testid="money-tokens">
      <Head title="Tokens & lookups" onRefresh={() => void load()} busy={busy}>
        <div className="tabs" role="group" aria-label="Days" style={{ margin: 0 }}>
          {[7, 30, 90].map(n => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>)}
        </div>
      </Head>
      <div className="stats" data-testid="tk-stats">
        <Stat label="Oneharta credits today" value={spend.today_credits} sub={`${fmtMyr(spend.today_credits * RM_PER_CREDIT)} · counts held ones too`} />
        <Stat label={`Credits, ${days} days (real tokens)`} value={credits(real)} sub={fmtMyr(credits(real) * RM_PER_CREDIT)} />
        <Stat label={`Credits, ${days} days (test tokens)`} value={credits(test)} sub={`${fmtMyr(credits(test) * RM_PER_CREDIT)} — real Oneharta money`} level={credits(test) > 0 ? 'amber' : 'ok'} />
        <Stat label={`Tokens sold, ${days} days (real)`} value={fmtUsd(sold / 100)} sub="before Google's 15–30%" />
        <Stat label="Need settling" value={attention.length} level={attention.length > 0 ? 'red' : 'ok'} />
      </div>

      <h3>Need settling</h3>
      {attention.length === 0 ? <p className="muted" data-testid="tk-attention-none">Nothing to settle: every lookup has its answer.</p> : (
        <div className="tablewrap dash-table"><table data-testid="tk-attention">
          <thead><tr><th>When</th><th>Agent</th><th>Lookup</th><th>Tokens held</th><th /></tr></thead>
          <tbody>{attention.map(l => (
            <tr key={l.id} data-testid="tk-attention-row">
              <td>{fmtTime(l.created_at)}<br /><small className="muted">{l.stuck ? 'still running after 10 min' : 'Oneharta did not answer'}</small></td>
              <td>{l.email ?? l.user_id}</td>
              <td>{KIND_LABEL[l.kind]} {envTag(l.env)}<br /><small className="muted">{l.summary}</small></td>
              <td>{l.tokens_held} <small className="muted">(up to {l.credits_max} credit{l.credits_max === 1 ? '' : 's'})</small></td>
              <td>{settler && <button className="btn small gold" data-testid="tk-settle" onClick={() => setSettle(l)}>Settle</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <p className="notice small">Before settling, open Oneharta (oneharta.com › API › call log, or Credits history) and find the call at that time.
        If it charged credits, record how many: the agent keeps paying 3 tokens per credit and gets the rest back. If it charged nothing, the agent gets every token back.</p>

      <h3>Spend by day</h3>
      <div className="tablewrap dash-table"><table data-testid="tk-days">
        <thead><tr><th>Day</th><th>Tokens</th><th>Lookups</th><th>Credits</th><th>Cost</th><th>Tokens charged</th><th>Held</th></tr></thead>
        <tbody>{spend.by_day.length === 0 ? <tr><td colSpan={7} className="muted">No lookups in these days.</td></tr> : spend.by_day.map(d => (
          <tr key={`${d.day}-${d.env}`}><td>{d.day}</td><td>{envTag(d.env)}</td><td>{d.lookups}</td><td>{d.credits}</td><td>{fmtMyr(d.credits * RM_PER_CREDIT)}</td>
            <td>{d.tokens}</td><td>{d.credits_held > 0 ? <span className="tag amber">{d.credits_held} credits</span> : ''}</td></tr>))}</tbody>
      </table></div>
      {spend.today_top.length > 0 && <><h3>Today's busiest agents</h3>
        <div className="tablewrap dash-table"><table data-testid="tk-top">
          <thead><tr><th>Agent</th><th>Lookups</th><th>Credits</th></tr></thead>
          <tbody>{spend.today_top.map(a => <tr key={a.user_id}><td>{a.email ?? a.user_id}</td><td>{a.lookups}</td><td>{a.credits}</td></tr>)}</tbody>
        </table></div></>}

      <h3>Recent lookups</h3>
      <div className="tablewrap dash-table"><table data-testid="tk-recent">
        <thead><tr><th>When</th><th>Agent</th><th>Lookup</th><th>Result</th><th>Tokens</th></tr></thead>
        <tbody>{recent.length === 0 ? <tr><td colSpan={5} className="muted">No lookups yet.</td></tr> : recent.slice(0, 100).map(l => (
          <tr key={l.id}><td>{fmtTime(l.created_at)}</td><td>{l.email ?? l.user_id}</td><td>{KIND_LABEL[l.kind]} {envTag(l.env)}<br /><small className="muted">{l.summary}</small></td>
            <td><span className={`tag ${STATUS[l.status][1]}`}>{l.stuck ? 'stuck — settle' : STATUS[l.status][0]}</span></td>
            <td>{l.tokens_charged ?? l.tokens_held}{l.credits_charged !== null ? <small className="muted"> · {l.credits_charged} cr</small> : null}</td></tr>))}</tbody>
      </table></div>

      <Balances />
      {settle && <SettleDialog l={settle} onClose={() => setSettle(null)} onDone={() => { setSettle(null); void load(); }} />}
    </div>
  );
}

function SettleDialog({ l, onClose, onDone }: { l: LookupRow; onClose: () => void; onDone: () => void }) {
  const { api } = useAdmin();
  const [outcome, setOutcome] = useState<'charged' | 'not_charged' | null>(null);
  const [credits, setCredits] = useState(String(l.credits_max));
  const [next, setNext] = useState(false);
  const n = Number(credits);
  const okCredits = Number.isInteger(n) && n >= 1 && n <= l.credits_max;
  const ready = outcome === 'not_charged' || (outcome === 'charged' && okCredits);
  if (next && outcome) return (
    <ConfirmDialog title="Settle this lookup" confirmLabel="Settle" onClose={onClose}
      body={<ul><li>{l.email ?? l.user_id} · {KIND_LABEL[l.kind]} · {l.summary}</li>
        {outcome === 'charged' ? <li>Oneharta charged <b>{n} credit{n === 1 ? '' : 's'}</b>: the agent pays <b>{n * 3} tokens</b> and gets <b>{l.tokens_held - n * 3}</b> back.</li>
          : <li>Oneharta charged nothing: the agent gets all <b>{l.tokens_held} tokens</b> back.</li>}</ul>}
      onConfirm={async reason => { await api.lookupSettle(l.id, outcome, outcome === 'charged' ? n : null, reason); onDone(); }} />
  );
  return (
    <div className="overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Settle a lookup" data-testid="tk-settle-dialog">
        <h2>What did Oneharta charge?</h2>
        <p className="small">{l.email ?? l.user_id} · {fmtTime(l.created_at)} · {KIND_LABEL[l.kind]} · {l.summary}. Holding {l.tokens_held} tokens (up to {l.credits_max} credits).</p>
        <label className="row"><input type="radio" name="outcome" checked={outcome === 'charged'} onChange={() => setOutcome('charged')} data-testid="tk-charged" /> The call log shows it was charged</label>
        {outcome === 'charged' && <label className="field"><span>Credits charged (1 to {l.credits_max})</span>
          <input inputMode="numeric" value={credits} onChange={e => setCredits(e.target.value)} data-testid="tk-credits" /></label>}
        <label className="row"><input type="radio" name="outcome" checked={outcome === 'not_charged'} onChange={() => setOutcome('not_charged')} data-testid="tk-not-charged" /> It is not in the call log (not charged)</label>
        <div className="row"><button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
          <button className="btn gold" disabled={!ready} onClick={() => setNext(true)} data-testid="tk-settle-next">Next</button></div>
      </div>
    </div>
  );
}

function Balances() {
  const { api, me } = useAdmin();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const { data: rows, err, busy, load } = useLoad(() => api.tokenBalances(query), [api, query]);
  const [hist, setHist] = useState<{ row: TokenBalanceRow; list: TokenLedgerRow[] } | null>(null);
  const [adjust, setAdjust] = useState<TokenBalanceRow | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const owner = can(me.role, 'editMoney');
  const open = async (row: TokenBalanceRow) => { setMsg(null); try { setHist({ row, list: await api.tokenHistory(row.user_id) }); } catch (e) { setMsg({ text: errText(e), ok: false }); } };
  return (
    <div className="stack" data-testid="tk-balances">
      <Head title="Agents' tokens" onRefresh={() => void load()} busy={busy} />
      <div className="row">
        <input className="spacer" placeholder="Search by email" value={q} onChange={e => setQ(e.target.value)} data-testid="tk-q" onKeyDown={e => { if (e.key === 'Enter') setQuery(q.trim() || null); }} />
        <button className="btn small" onClick={() => setQuery(q.trim() || null)} data-testid="tk-search">Search</button>
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !rows ? <Loading /> : (
        <div className="tablewrap dash-table"><table data-testid="tk-balance-table">
          <thead><tr><th>Agent</th><th>Test tokens</th><th>Real tokens</th><th>Last change</th><th /></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={5} className="muted">No agent has tokens yet.</td></tr> : rows.map(r => (
            <tr key={r.user_id} data-testid="tk-balance-row"><td>{r.email ?? r.user_id}</td><td>{r.sandbox ?? 0}</td><td>{r.live ?? 0}</td><td>{r.last_change ? fmtTime(r.last_change) : ''}</td>
              <td className="row"><button className="btn small" onClick={() => void open(r)} data-testid="tk-history">History</button>
                {owner && <button className="btn small" onClick={() => { setMsg(null); setAdjust(r); }} data-testid="tk-adjust">Add / take</button>}</td></tr>))}</tbody>
        </table></div>
      )}
      {msg && <p className={msg.ok ? 'notice ok small' : 'error small'} role="status" data-testid="tk-msg">{msg.text}</p>}
      {hist && <div className="card boxed stack" data-testid="tk-history-box">
        <div className="row"><b className="spacer">{hist.row.email ?? hist.row.user_id}: last {hist.list.length} changes</b><button className="btn small" onClick={() => setHist(null)}>Close</button></div>
        <div className="tablewrap dash-table"><table>
          <thead><tr><th>When</th><th>Tokens</th><th>Change</th><th>What</th></tr></thead>
          <tbody>{hist.list.map(h => <tr key={h.id} data-testid="tk-history-row"><td>{fmtTime(h.created_at)}</td><td>{envTag(h.env)}</td>
            <td><b>{h.delta > 0 ? `+${h.delta}` : h.delta}</b></td>
            <td className="small">{({ purchase: `bought ${h.pack_id ?? ''}${h.amount_cents ? ` · ${fmtUsd(h.amount_cents / 100)}` : ''}`, spend: 'lookup (most it can cost, held)', refund: h.ref?.startsWith('gp:') ? 'pack refunded by Google' : 'lookup: given back', adjust: 'added / taken by the Owner' } as Record<string, string>)[h.kind]}</td></tr>)}</tbody>
        </table></div>
      </div>}
      {adjust && <AdjustDialog row={adjust} onClose={() => setAdjust(null)} onDone={m => { setAdjust(null); setMsg({ text: m, ok: true }); void load(); }} />}
    </div>
  );
}

function AdjustDialog({ row, onClose, onDone }: { row: TokenBalanceRow; onClose: () => void; onDone: (msg: string) => void }) {
  const { api } = useAdmin();
  const [env, setEnv] = useState<TokenEnv>('sandbox');
  const [amount, setAmount] = useState('');
  const [take, setTake] = useState(false);
  const [next, setNext] = useState(false);
  const n = Number(amount);
  const have = (env === 'live' ? row.live : row.sandbox) ?? 0;
  const delta = take ? -n : n;
  const ok = Number.isInteger(n) && n >= 1 && n <= 10000 && have + delta >= 0;
  if (next) return (
    <ConfirmDialog title={take ? 'Take tokens' : 'Add tokens'} confirmLabel={take ? 'Take tokens' : 'Add tokens'} danger={take} onClose={onClose}
      body={<ul><li>{row.email ?? row.user_id}</li><li>{env === 'live' ? 'Real' : 'Test'} tokens: {have} → <b>{have + delta}</b> ({delta > 0 ? `+${delta}` : delta})</li></ul>}
      onConfirm={async reason => { const r = await api.tokenAdjust(row.user_id, env, delta, reason); onDone(`Done. ${row.email ?? ''} now has ${r.balance} ${env === 'live' ? 'real' : 'test'} tokens.`); }} />
  );
  return (
    <div className="overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Add or take tokens" data-testid="tk-adjust-dialog">
        <h2>Add or take tokens</h2>
        <p className="small">{row.email ?? row.user_id}. Use this for goodwill or to correct a mistake; a Google refund of a pack is taken back by itself.</p>
        <label className="field"><span>Which tokens</span>
          <select value={env} onChange={e => setEnv(e.target.value as TokenEnv)} data-testid="tk-env"><option value="sandbox">Test tokens ({row.sandbox ?? 0})</option><option value="live">Real tokens ({row.live ?? 0})</option></select></label>
        <div className="tabs" role="group" aria-label="Add or take" style={{ margin: 0 }}>
          <button aria-pressed={!take} onClick={() => setTake(false)} data-testid="tk-add-mode">Add</button>
          <button aria-pressed={take} onClick={() => setTake(true)} data-testid="tk-take-mode">Take</button>
        </div>
        <label className="field"><span>How many tokens (1 to 10,000)</span><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} data-testid="tk-amount" /></label>
        {take && Number.isInteger(n) && n > have && <small className="error">They have only {have}.</small>}
        <div className="row"><button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
          <button className="btn gold" disabled={!ok} onClick={() => setNext(true)} data-testid="tk-adjust-next">Next</button></div>
      </div>
    </div>
  );
}
