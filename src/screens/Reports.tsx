// AdminBatch008 — Reports (features 90, 127, 129), one screen with three tabs.
//   Board report     one month against the month before (Owner / Compliance); PDF or Excel, kept in the Document Vault
//   Audit bundle     one year of evidence: Excel workbook + PDF summary (Owner / Compliance), kept in the Document Vault
//   Report builder   pick a source, columns or totals, filters, sort; preview with a chart; save for every admin; PDF / Excel
//                    (exports Owner / Compliance). Viewers build totals only, never names. The database checks every spec.
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ReportsTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { AuditBundle, BoardReport, ReportCatalog, ReportOp, ReportResult, ReportSpec, SavedReport } from '../api/admin';
import { todayKL } from '../admin/health';
import {
  Draft, IS_VALUES, MAX_FILTERS, OP_LABEL, boardSections, cellText, changeText, chartItems, draftProblems, draftToSpec, isValuesFor, measureLabel,
  monthName, monthOptions, newDraft, opsFor, prevMonth, resultHeaders, specToDraft, yearOptions,
} from '../admin/reports';
import { auditCounts, exportAuditBundle, exportBoardReport, exportCustomReport, specText } from '../export/board';
import { fmtTime } from '../export/reports';
import { HBars } from './charts';
import { ErrorBox, Loading } from './ui';

const TABS: { k: ReportsTab; label: string; needs: 'boardReport' | 'auditBundle' | 'reportBuilder' }[] = [
  { k: 'board', label: 'Board report', needs: 'boardReport' },
  { k: 'audit', label: 'Audit bundle', needs: 'auditBundle' },
  { k: 'builder', label: 'Report builder', needs: 'reportBuilder' },
];

export function ReportsScreen({ tab: first }: { tab: ReportsTab }) {
  const { me } = useAdmin();
  const tabs = TABS.filter(t => can(me.role, t.needs));
  const [tab, setTab] = useState<ReportsTab>(tabs.some(t => t.k === first) ? first : tabs[0]?.k ?? 'builder');
  if (!tabs.length) return <p className="notice">Your admin role does not use reports.</p>;
  return (
    <div className="stack" data-testid="reports">
      <h1>Reports</h1>
      {tabs.length > 1 && (
        <div className="tabs" role="group" aria-label="Reports">
          {tabs.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`rtab-${t.k}`}>{t.label}</button>)}
        </div>
      )}
      {tab === 'board' && <BoardTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'builder' && <BuilderTab />}
    </div>
  );
}

function Msg({ m, testid }: { m: { ok: boolean; text: ReactNode } | null; testid: string }) {
  return m ? <p className={`notice small ${m.ok ? '' : 'error'}`} role="status" data-testid={testid}>{m.text}</p> : null;
}

// =====================================================================================================
// Board report
// =====================================================================================================
function BoardTab() {
  const { api, me } = useAdmin();
  const today = todayKL();
  const months = monthOptions(today);
  const [month, setMonth] = useState(() => (months.includes(prevMonth(months[0])) ? prevMonth(months[0]) : months[0]));
  const [data, setData] = useState<BoardReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const load = useCallback(async () => { setErr(null); setData(null); try { setData(await api.boardReport(month)); } catch (e) { setErr(errText(e)); } }, [api, month]);
  useEffect(() => { void load(); }, [load]);
  const make = async (format: 'pdf' | 'xlsx') => {
    setMsg(null); setBusy('Starting…');
    try {
      const r = await exportBoardReport(api, me.email, month, format, setBusy);
      setMsg({ ok: true, text: <><b>{r.pack.reference}</b> kept in the Document Vault · {r.how}</> });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="stack">
      <div className="row">
        <label className="field"><span>Month</span>
          <select value={month} onChange={e => setMonth(e.target.value)} data-testid="board-month">
            {months.map(m => <option key={m} value={m}>{monthName(m)}{m === months[0] ? ' (so far)' : ''}</option>)}
          </select></label>
        <span className="spacer" />
        <button className="btn gold" disabled={!!busy || !data} onClick={() => void make('pdf')} data-testid="board-pdf">PDF</button>
        <button className="btn gold" disabled={!!busy || !data} onClick={() => void make('xlsx')} data-testid="board-xlsx">Excel</button>
      </div>
      {busy && <p className="muted small" role="status">{busy}</p>}
      <Msg m={msg} testid="board-msg" />
      {err && <ErrorBox text={err} onRetry={() => void load()} />}
      {!err && !data && <Loading />}
      {data && (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            {monthName(data.month)}{data.complete ? '' : ` so far (to ${data.current.to})`} compared with {monthName(data.previous.from)}. Totals only — no agent is named.
            Each file gets a reference number and is kept in the Document Vault.
          </p>
          <div className="tablewrap dash-table"><table data-testid="board-table">
            <thead><tr><th>Line</th><th>{monthName(data.month)}</th><th>{monthName(data.previous.from)}</th><th>Change</th></tr></thead>
            <tbody>{boardSections(data).flatMap(s => [
              <tr key={s.title} className="sect"><th colSpan={4}>{s.title}</th></tr>,
              ...s.lines.map((l, i) => (
                <tr key={`${s.title}-${i}`} className={l.warn ? 'alert-red' : ''}>
                  <td>{l.sub ? <small className="muted">· {l.label}</small> : l.label}{l.text && <><br /><small className="muted">{l.text}</small></>}</td>
                  <td>{l.cur.toLocaleString('en-MY')}</td>
                  <td>{l.prev === null ? <small className="muted">today</small> : l.prev.toLocaleString('en-MY')}</td>
                  <td className="small">{l.prev === null ? '' : changeText(l.cur, l.prev)}</td>
                </tr>
              )),
            ])}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

// =====================================================================================================
// Audit bundle
// =====================================================================================================
function AuditTab() {
  const { api, me } = useAdmin();
  const today = todayKL();
  const years = yearOptions(today);
  const [year, setYear] = useState(years[0]);
  const [data, setData] = useState<AuditBundle | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const check = async () => { setErr(null); setChecking(true); try { setData(await api.auditBundle(year)); } catch (e) { setErr(errText(e)); } finally { setChecking(false); } };
  const make = async () => {
    setMsg(null); setBusy('Starting…');
    try {
      const r = await exportAuditBundle(api, me.email, year, setBusy);
      setMsg({ ok: true, text: <>Workbook <b>{r.workbook.reference}</b> and summary <b>{r.summary.reference}</b> kept in the Document Vault · {r.how.join(' · ')}</> });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const c = data ? auditCounts(data, today) : null;
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Everything an auditor asks for one year: the Master Audit Log and the access log (each row with its fingerprint), the tamper check, backup restore tests,
        case files with their packs, PDPA requests, complaints, legal holds and retention reviews. Makes an <b>Excel workbook</b> with every list and a <b>PDF summary</b>
        that names the workbook and its fingerprint. Both are kept in the Document Vault.
      </p>
      <div className="row">
        <label className="field"><span>Year</span>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setData(null); }} data-testid="audit-year">
            {years.map(y => <option key={y} value={y}>{y}{y === years[0] ? ' (so far)' : ''}</option>)}
          </select></label>
        <span className="spacer" />
        <button className="btn" disabled={checking || !!busy} onClick={() => void check()} data-testid="audit-check">{checking ? 'Checking…' : 'Check the year'}</button>
        <button className="btn gold" disabled={!!busy} onClick={() => void make()} data-testid="audit-make">Make the audit bundle</button>
      </div>
      {busy && <p className="muted small" role="status">{busy}</p>}
      <Msg m={msg} testid="audit-msg" />
      {err && <ErrorBox text={err} onRetry={() => void check()} />}
      {data && c && (
        <div className="tablewrap dash-table"><table data-testid="audit-summary">
          <tbody>
            <tr className={c.chainOk ? '' : 'alert-red'}><td>Tamper check</td><td>{c.chainOk ? <span className="tag ok">Both logs unbroken</span> : <span className="tag red">BROKEN — tell the Owner</span>}</td></tr>
            <tr><td>Admin actions in {data.year}</td><td>{c.actions.toLocaleString('en-MY')}{c.actionsCut && <small className="muted"> (workbook holds the first {data.actions.length.toLocaleString('en-MY')})</small>}</td></tr>
            <tr><td>Access log rows</td><td>{c.access.toLocaleString('en-MY')}{c.accessCut && <small className="muted"> (workbook holds the first {data.access.length.toLocaleString('en-MY')})</small>}</td></tr>
            <tr className={c.restoreTests ? '' : 'alert-red'}><td>Restore tests</td><td>{c.restoreTests} ({c.failedTests} not passed)</td></tr>
            <tr><td>Regulator cases</td><td>{c.cases}</td></tr>
            <tr><td>Files kept in the vault</td><td>{c.packs}</td></tr>
            <tr className={c.pdpaLate ? 'alert-red' : ''}><td>PDPA requests</td><td>{c.pdpa} ({c.pdpaLate} over 21 days)</td></tr>
            <tr><td>Complaints</td><td>{c.complaints}</td></tr>
            <tr><td>Legal holds</td><td>{c.holds} ({c.holdsActive} still in force)</td></tr>
            <tr><td>Retention reviews</td><td>{c.reviews}</td></tr>
          </tbody>
        </table></div>
      )}
    </div>
  );
}

// =====================================================================================================
// Report builder
// =====================================================================================================
function BuilderTab() {
  const { api, me } = useAdmin();
  const names = can(me.role, 'reportNames');
  const [cat, setCat] = useState<ReportCatalog | null>(null);
  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<SavedReport | null>(null);
  const [name, setName] = useState('');
  const [res, setRes] = useState<{ spec: ReportSpec; result: ReportResult } | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [del, setDel] = useState<SavedReport | null>(null);

  const loadSaved = useCallback(async () => { try { setSaved(await api.savedReports()); } catch (e) { setErr(errText(e)); } }, [api]);
  useEffect(() => {
    api.reportCatalog().then(c => { setCat(c); const first = Object.keys(c)[0]; if (first) setD(newDraft(first, c[first], names)); }).catch(e => setErr(errText(e)));
    void loadSaved();
  }, [api, names, loadSaved]);

  const src = d && cat ? cat[d.source] : undefined;
  const problems = useMemo(() => (d ? draftProblems(d, src, names) : []), [d, src, names]);
  if (err) return <ErrorBox text={err} />;
  if (!cat || !d || !saved) return <Loading />;

  const cols = Object.entries(src?.columns ?? {}).filter(([, c]) => names || !c.p);
  const numCols = cols.filter(([, c]) => c.t === 'num');
  const set = (p: Partial<Draft>) => { setD({ ...d, ...p }); setMsg(null); };
  const pickSource = (s: string) => { setD(newDraft(s, cat[s], names)); setRes(null); setOpenId(null); setName(''); setMsg(null); };
  const run = async () => {
    setBusy(true); setRunErr(null);
    const spec = draftToSpec(d, src);
    try { setRes({ spec, result: await api.reportRun(spec) }); } catch (e) { setRunErr(errText(e)); } finally { setBusy(false); }
  };
  const open = (r: SavedReport) => {
    if (!cat[r.source]) return;
    setD(specToDraft(r.spec)); setOpenId(r); setName(r.name); setRes(null); setMsg(null);
  };
  const save = async (asNew: boolean) => {
    setMsg(null);
    try {
      const r = await api.savedReportSave({ ...(openId && !asNew ? { id: openId.id } : {}), name: name.trim(), source: d.source, spec: draftToSpec(d, src) });
      setOpenId(r); setMsg({ ok: true, text: <>Saved “{r.name}”. Every admin who may run {src?.label} reports can open it.</> }); await loadSaved();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const exportIt = async (format: 'pdf' | 'xlsx') => {
    if (!res || !src) return;
    setMsg(null);
    try { const r = await exportCustomReport(api, me.email, format, name.trim() || `${src.label} report`, res.spec, cat[res.spec.source], res.result); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const remove = async (r: SavedReport) => {
    try { await api.savedReportDelete(r.id); setDel(null); if (openId?.id === r.id) setOpenId(null); setMsg({ ok: true, text: `Removed “${r.name}” (recorded in the Master Audit Log).` }); await loadSaved(); }
    catch (e) { setDel(null); setMsg({ ok: false, text: errText(e) }); }
  };
  const fset = (i: number, p: Partial<Draft['filters'][number]>) => set({ filters: d.filters.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const sortChoices = d.mode === 'rows' ? d.columns : [...d.group_by, 'value'];
  const headers = res ? resultHeaders(res.spec, cat[res.spec.source]) : [];

  return (
    <div className="stack">
      {!names && <p className="notice small" data-testid="rb-totals-only">Your role builds totals (grouped counts) only. Names and emails are never shown.</p>}
      <div className="card boxed stack" data-testid="rb-saved">
        <h3 style={{ margin: 0 }}>Saved reports <small className="muted">shared with every admin</small></h3>
        {saved.length === 0 ? <p className="muted small" style={{ margin: 0 }}>None yet. Build a report below and save it.</p> : saved.map(r => (
          <div key={r.id} className="row" data-testid="rb-saved-row">
            <button className="linkbtn spacer" style={{ textAlign: 'left' }} onClick={() => open(r)} data-testid="rb-open">{r.name}</button>
            <small className="muted">{cat[r.source]?.label ?? r.source} · {r.created_by_email ?? ''} · {fmtTime(r.updated_at)}</small>
            {(r.created_by === me.user_id || me.role === 'owner') && (del?.id === r.id ? <>
              <small>Remove for every admin?</small>
              <button className="btn small danger" onClick={() => void remove(r)} data-testid="rb-remove-yes">Yes, remove</button>
              <button className="btn small" onClick={() => setDel(null)}>Cancel</button>
            </> : <button className="btn small" onClick={() => setDel(r)} data-testid="rb-remove">Remove</button>)}
          </div>
        ))}
      </div>

      <div className="card boxed stack" data-testid="rb-form">
        <div className="grid2">
          <label className="field"><span>Report about</span>
            <select value={d.source} onChange={e => pickSource(e.target.value)} data-testid="rb-source">
              {Object.entries(cat).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select></label>
          <fieldset className="field"><span>Show</span>
            <div className="row">
              <label className="choice"><input type="radio" name="rb-mode" checked={d.mode === 'rows'} disabled={!names} onChange={() => set({ mode: 'rows', sortBy: '' })} data-testid="rb-mode-rows" /> Rows (a list)</label>
              <label className="choice"><input type="radio" name="rb-mode" checked={d.mode === 'totals'} onChange={() => set({ mode: 'totals', sortBy: '', group_by: d.group_by.length ? d.group_by : [cols.find(([, c]) => c.t !== 'num')?.[0] ?? cols[0]?.[0]].filter(Boolean) as string[] })} data-testid="rb-mode-totals" /> Totals (grouped counts)</label>
            </div></fieldset>
        </div>

        {d.mode === 'rows' ? (
          <fieldset className="field"><span>Columns</span>
            <div className="row" style={{ flexWrap: 'wrap' }}>{cols.map(([k, c]) => (
              <label key={k} className="choice"><input type="checkbox" checked={d.columns.includes(k)} data-testid={`rb-col-${k}`}
                onChange={e => set({ columns: e.target.checked ? [...d.columns, k] : d.columns.filter(x => x !== k), sortBy: d.sortBy === k && !e.target.checked ? '' : d.sortBy })} /> {c.l}</label>
            ))}</div></fieldset>
        ) : (
          <div className="grid2">
            {[0, 1].map(i => (
              <label key={i} className="field"><span>{i === 0 ? 'Group by' : 'Then by (optional)'}</span>
                <select value={d.group_by[i] ?? ''} data-testid={`rb-group-${i}`}
                  onChange={e => { const g = [...d.group_by]; if (e.target.value) g[i] = e.target.value; else g.splice(i, 1); set({ group_by: g.filter(Boolean).slice(0, 2), sortBy: '' }); }}>
                  {i === 1 && <option value="">— none —</option>}
                  {cols.map(([k, c]) => <option key={k} value={k}>{c.l}</option>)}
                </select></label>
            ))}
            <label className="field"><span>Number to show</span>
              <select value={d.measure} onChange={e => set({ measure: e.target.value })} data-testid="rb-measure">
                <option value="count">How many</option>
                {numCols.flatMap(([k, c]) => [<option key={`s${k}`} value={`sum:${k}`}>Total {c.l}</option>, <option key={`a${k}`} value={`avg:${k}`}>Average {c.l}</option>])}
              </select></label>
          </div>
        )}

        <div className="grid2">
          <label className="field"><span>{src?.columns[src.date]?.l ?? 'Date'} from</span><input type="date" value={d.from} onChange={e => set({ from: e.target.value })} data-testid="rb-from" /></label>
          <label className="field"><span>to</span><input type="date" value={d.to} onChange={e => set({ to: e.target.value })} data-testid="rb-to" /></label>
        </div>

        <fieldset className="field"><span>Filters</span>
          <div className="stack" style={{ gap: 6 }}>
            {d.filters.map((f, i) => {
              const c = src?.columns[f.col]; const ops = c ? opsFor(c.t) : [];
              return (
                <div key={i} className="row" data-testid="rb-filter">
                  <select value={f.col} data-testid={`rb-f-col-${i}`} onChange={e => { const t = src?.columns[e.target.value]?.t ?? 'text'; fset(i, { col: e.target.value, op: opsFor(t)[0], value: '' }); }}>
                    {cols.map(([k, cc]) => <option key={k} value={k}>{cc.l}</option>)}
                  </select>
                  <select value={f.op} data-testid={`rb-f-op-${i}`} onChange={e => fset(i, { op: e.target.value as ReportOp, value: '' })}>
                    {ops.map(o => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </select>
                  {f.op === 'is' ? (
                    <select value={f.value} data-testid={`rb-f-val-${i}`} onChange={e => fset(i, { value: e.target.value })}>
                      <option value="">— choose —</option>
                      {isValuesFor(c?.t ?? 'text').map(v => <option key={v} value={v}>{IS_VALUES[v]}</option>)}
                    </select>
                  ) : (
                    <input className="spacer" type={f.op === 'after' || f.op === 'before' ? 'date' : 'text'} inputMode={c?.t === 'num' ? 'decimal' : undefined}
                      placeholder={f.op === 'in' ? 'values, separated by commas' : ''} value={f.value} onChange={e => fset(i, { value: e.target.value })} data-testid={`rb-f-val-${i}`} />
                  )}
                  <button className="btn small" onClick={() => set({ filters: d.filters.filter((_, j) => j !== i) })} aria-label="Remove filter">✕</button>
                </div>
              );
            })}
            {d.filters.length < MAX_FILTERS && cols.length > 0 && (
              <button className="btn small" style={{ alignSelf: 'flex-start' }} data-testid="rb-add-filter"
                onClick={() => set({ filters: [...d.filters, { col: cols[0][0], op: opsFor(cols[0][1].t)[0], value: '' }] })}>+ Add filter</button>
            )}
          </div></fieldset>

        <div className="grid2">
          <label className="field"><span>Sort by</span>
            <select value={d.sortBy} onChange={e => set({ sortBy: e.target.value })} data-testid="rb-sort">
              <option value="">{d.mode === 'totals' ? 'Biggest number first' : 'First column'}</option>
              {sortChoices.map(k => <option key={k} value={k}>{k === 'value' ? measureLabel(d.measure, src) : src?.columns[k]?.l ?? k}</option>)}
            </select></label>
          <label className="field"><span>Order</span>
            <select value={d.sortDir} onChange={e => set({ sortDir: e.target.value as 'asc' | 'desc' })} data-testid="rb-dir">
              <option value="desc">Highest / newest first</option><option value="asc">Lowest / oldest first</option>
            </select></label>
          <label className="field"><span>Most rows to show</span><input type="number" min={1} max={5000} value={d.limit} onChange={e => set({ limit: Number(e.target.value) })} data-testid="rb-limit" /></label>
        </div>

        {problems.length > 0 && <ul className="error small" data-testid="rb-problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
        <div className="row">
          <button className="btn gold" disabled={busy || problems.length > 0} onClick={() => void run()} data-testid="rb-run">{busy ? 'Running…' : 'Run report'}</button>
          <span className="spacer" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name to save it under" maxLength={120} data-testid="rb-name" />
          {openId && <button className="btn" disabled={!name.trim() || problems.length > 0} onClick={() => void save(false)} data-testid="rb-save-changes">Save changes</button>}
          <button className="btn" disabled={!name.trim() || problems.length > 0} onClick={() => void save(true)} data-testid="rb-save">{openId ? 'Save as new' : 'Save'}</button>
        </div>
      </div>

      <Msg m={msg} testid="rb-msg" />
      {runErr && <ErrorBox text={runErr} />}
      {res && (
        <div className="stack" data-testid="rb-result">
          <div className="row">
            <p className="muted small spacer" style={{ margin: 0 }} data-testid="rb-count">
              {res.result.count.toLocaleString('en-MY')} row{res.result.count === 1 ? '' : 's'}{res.result.truncated ? ' — more exist; raise the row limit or add filters' : ''} · {specText(res.spec, cat[res.spec.source]).join(' · ')}
            </p>
            {can(me.role, 'export') && <>
              <button className="btn small gold" onClick={() => void exportIt('pdf')} data-testid="rb-pdf">PDF</button>
              <button className="btn small gold" onClick={() => void exportIt('xlsx')} data-testid="rb-xlsx">Excel</button>
            </>}
          </div>
          {!!res.spec.group_by?.length && <HBars items={chartItems(res.spec, res.result, cat[res.spec.source])} label={measureLabel(res.spec.measure, cat[res.spec.source])} testid="rb-chart" />}
          {res.result.rows.length === 0 ? <p className="muted">Nothing matches.</p> : (
            <div className="tablewrap dash-table"><table data-testid="rb-table">
              <thead><tr>{headers.map(h => <th key={h.key}>{h.label}</th>)}</tr></thead>
              <tbody>{res.result.rows.slice(0, 500).map((r, i) => <tr key={i}>{headers.map(h => <td key={h.key}>{cellText(r[h.key], h.t, h.key)}</td>)}</tr>)}</tbody>
            </table></div>
          )}
          {res.result.rows.length > 500 && <p className="muted small">The screen shows the first 500 rows; the Excel file has all {res.result.rows.length.toLocaleString('en-MY')}.</p>}
        </div>
      )}
    </div>
  );
}
