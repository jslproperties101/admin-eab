// AdminBatch004 — System Health (features 3, 4, 5, 9, 39, 41, 42, 43, 44), one screen with tabs:
//   Database      table sizes, connections, cache hit rate, slow queries
//   Storage       used vs free boxes for the database and stored files, and when they fill up at the current rate
//   Backups       Supabase and AWS boxes, the backup check / restore test log (kept forever), record a new test
//   Sync          sync runs and failures per day and per agent (agent lists: Owner, Admin, Compliance only)
//   Push          phones registered, broadcast sent / delivered / opened
//   Performance   app start time by version, sessions per day, versions in use
//   Problems      problem reports sent from the main app, and failures it recorded in the last 7 days
// Numbers come from the eab_admin_* health functions; nothing here changes an agent's data.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { HealthTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import {
  BackupKind, BackupResult, BackupTarget, BackupTest, DbHealth, ErrorReports, HealthLimits, NewBackupTest, Performance,
  PushHealth, ReportStatus, StorageHealth, SyncHealth,
} from '../api/admin';
import { fmtTime } from '../export/reports';
import { KIND_LABEL, RESULT_LABEL, TARGET_LABEL, exportHealthReport, storageForecasts } from '../export/health';
import { Forecast, MB, RESTORE_TEST_DUE_DAYS, daysSince, failRate, fmtBytes, fmtMs, fmtPct, levelFor, pct, todayKL } from '../admin/health';
import { platformLabel } from './status';
import { ConfirmDialog, ErrorBox, Kv, Loading } from './ui';

const TABS: { k: HealthTab; label: string }[] = [
  { k: 'db', label: 'Database' }, { k: 'storage', label: 'Storage' }, { k: 'backups', label: 'Backups' },
  { k: 'sync', label: 'Sync' }, { k: 'push', label: 'Push' }, { k: 'performance', label: 'Performance' }, { k: 'errors', label: 'Problems' },
];

export function HealthScreen({ tab: first }: { tab: HealthTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<HealthTab>(first);
  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">System Health</h1>
        {can(me.role, 'export') && <HealthExport />}
      </div>
      <div className="tabs" role="group" aria-label="System Health sections">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`htab-${t.k}`}>{t.label}</button>)}
      </div>
      {tab === 'db' && <DbTab />}
      {tab === 'storage' && <StorageTab />}
      {tab === 'backups' && <BackupsTab />}
      {tab === 'sync' && <SyncTab />}
      {tab === 'push' && <PushTab />}
      {tab === 'performance' && <PerformanceTab />}
      {tab === 'errors' && <ErrorsTab />}
    </div>
  );
}

/** Loads one health call, with Refresh and Try again. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setData(await fn()); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, busy, load, setData };
}

function Head({ title, checked, onRefresh, busy, children }: { title: string; checked?: string; onRefresh: () => void; busy: boolean; children?: ReactNode }) {
  return (
    <div className="row">
      <h2 className="spacer">{title}</h2>
      {children}
      {checked && <small className="muted">Checked {fmtTime(checked)}</small>}
      <button className="btn small" onClick={onRefresh} disabled={busy} data-testid="health-refresh">{busy ? 'Checking…' : 'Refresh'}</button>
    </div>
  );
}

function Stat({ label, value, sub, level }: { label: string; value: ReactNode; sub?: ReactNode; level?: 'ok' | 'amber' | 'red' }) {
  return (
    <div className={`stat ${level ?? ''}`}>
      <span className="l">{label}</span>
      <b className="v">{value}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

/** Feature 3's "box": used vs free with a coloured bar. */
function Meter({ title, used, limit, sub, testid }: { title: string; used: number; limit: number; sub?: ReactNode; testid?: string }) {
  const p = pct(used, limit), lvl = levelFor(p);
  return (
    <div className={`card boxed meter ${lvl}`} data-testid={testid}>
      <div className="row"><h3 className="spacer">{title}</h3><span className={`tag ${lvl === 'ok' ? 'ok' : lvl === 'amber' ? 'amber' : 'red'}`}>{fmtPct(p)} used</span></div>
      <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(p, 100))} aria-label={`${title} used`}>
        <span style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <div className="row small"><span>Used <b>{fmtBytes(used)}</b></span><span className="spacer" /><span>Free <b>{fmtBytes(Math.max(0, limit - used))}</b> of {fmtBytes(limit)}</span></div>
      {sub}
    </div>
  );
}

/** Simple bar chart (SVG): one bar per label; an optional red part on top (e.g. failures). */
function Bars({ items, label, redLabel }: { items: { label: string; value: number; red?: number }[]; label: string; redLabel?: string }) {
  if (!items.length) return <p className="muted small">Nothing recorded in this period.</p>;
  const max = Math.max(1, ...items.map(i => i.value));
  const w = 600, h = 140, gap = 2, bw = Math.max(2, (w - gap * items.length) / items.length);
  return (
    <figure className="chart" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" preserveAspectRatio="none">
        {items.map((it, i) => {
          const x = i * (bw + gap), vh = (it.value / max) * h, rh = ((it.red ?? 0) / max) * h;
          return (
            <g key={i}>
              <title>{`${it.label}: ${it.value}${it.red ? ` (${it.red} ${redLabel ?? 'failed'})` : ''}`}</title>
              <rect x={x} y={h - vh} width={bw} height={vh} className="b" />
              {rh > 0 && <rect x={x} y={h - rh} width={bw} height={rh} className="r" />}
            </g>
          );
        })}
      </svg>
      <div className="row small muted"><span>{items[0].label}</span><span className="spacer" /><span>{items[items.length - 1].label}</span></div>
      <figcaption className="small muted">{label} · highest {max.toLocaleString()}{redLabel && <> · <span className="error">■</span> {redLabel}</>}</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- Database (feature 4)
function DbTab() {
  const { api } = useAdmin();
  const { data: d, err, busy, load } = useLoad<DbHealth>(() => api.healthDb(), [api]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!d) return <Loading />;
  const c = d.connections, hit = d.stats?.cache_hit_pct ?? null;
  const connPct = pct(c.total, c.max);
  return (
    <div className="stack" data-testid="health-db">
      <Head title="Database health" checked={d.checked_at} onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Database size" value={fmtBytes(d.db_bytes)} sub={`of ${fmtBytes(d.limits.db_limit_mb * MB)} plan limit`} level={levelFor(pct(d.db_bytes, d.limits.db_limit_mb * MB))} />
        <Stat label="Connections" value={`${c.total} / ${c.max}`} sub={`${c.active} working · ${c.idle} idle${c.idle_in_transaction ? ` · ${c.idle_in_transaction} stuck` : ''}`} level={levelFor(connPct)} />
        <Stat label="Cache hit rate" value={fmtPct(hit, 2)} sub="99%+ is healthy" level={hit === null ? undefined : hit < 90 ? 'red' : hit < 99 ? 'amber' : 'ok'} />
        <Stat label="Slow queries now" value={d.slow_queries} sub={`longest running ${d.longest_query_s} s`} level={d.slow_queries ? 'amber' : 'ok'} />
        <Stat label="Deadlocks" value={d.stats?.deadlocks ?? 0} sub={d.stats?.since ? `since ${fmtTime(d.stats.since)}` : 'since the server started'} level={(d.stats?.deadlocks ?? 0) ? 'amber' : 'ok'} />
        <Stat label="Postgres" value={d.postgres} />
      </div>
      <h3>Tables ({d.tables.length}), largest first</h3>
      <div className="tablewrap">
        <table data-testid="db-tables">
          <thead><tr><th>Table</th><th>Size</th><th>Rows</th><th>Dead rows</th><th>Last tidy-up</th><th>Reads by index</th></tr></thead>
          <tbody>{d.tables.map(t => {
            const deadPct = pct(t.dead_rows, t.rows + t.dead_rows);
            const scans = t.seq_scans + t.index_scans;
            return (
              <tr key={t.name}>
                <td className="mono">{t.name}</td>
                <td>{fmtBytes(t.total_bytes)}</td>
                <td>{t.rows.toLocaleString()}</td>
                <td>{t.dead_rows ? <span className={deadPct > 20 ? 'tag amber' : ''}>{t.dead_rows.toLocaleString()}</span> : '0'}</td>
                <td className="small">{t.last_vacuum ? fmtTime(t.last_vacuum) : <span className="muted">not yet</span>}</td>
                <td className="small">{scans ? fmtPct(pct(t.index_scans, scans), 0) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <small className="muted">“Dead rows” are old copies left after changes; Postgres tidies them up automatically (“last tidy-up”). Amber means more than 1 in 5 rows is dead.</small>
    </div>
  );
}

// ---------------------------------------------------------------- Storage forecast (feature 41)
function ForecastLine({ f }: { f: Forecast }) {
  return <p className={`small ${f.daysLeft !== null && f.daysLeft < 90 ? 'error' : 'muted'}`} style={{ margin: 0 }} data-testid="forecast">{f.sentence}</p>;
}

function StorageTab() {
  const { api, me } = useAdmin();
  const { data: s, err, busy, load, setData } = useLoad<StorageHealth>(() => api.healthStorage(), [api]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  const today = todayKL();
  const f = storageForecasts(s, today);
  const days = s.daily.slice(-60);
  return (
    <div className="stack" data-testid="health-storage">
      <Head title="Storage and forecast" checked={s.checked_at} onRefresh={() => void load()} busy={busy} />
      <div className="grid2">
        <Meter title="Database" used={f.db.used} limit={f.db.limit} testid="meter-db" sub={<ForecastLine f={f.db} />} />
        <Meter title="Stored files (photos, documents, packs)" used={f.files.used} limit={f.files.limit} testid="meter-files"
          sub={<><small className="muted">{s.today.storage_files.toLocaleString()} files</small><ForecastLine f={f.files} /></>} />
      </div>
      <div className="card stack">
        <h3>Database size by day</h3>
        <Bars label="Database size (one reading a day, last 60 days)" items={days.map(d => ({ label: d.day, value: Math.round(d.db_bytes / 1024) }))} />
        <small className="muted">A reading is saved the first time someone opens this screen each day (Malaysia date). Values in KB.</small>
      </div>
      <div className="card stack">
        <h3>Files uploaded by day</h3>
        <Bars label="Uploaded per day (KB, last 180 days)" items={s.uploads.map(u => ({ label: u.day, value: Math.round(u.bytes / 1024) }))} />
      </div>
      <div className="tablewrap">
        <table data-testid="buckets">
          <thead><tr><th>Storage area</th><th>Files</th><th>Size</th><th>Newest file</th></tr></thead>
          <tbody>{s.buckets.map(b => <tr key={b.bucket}><td className="mono">{b.bucket}</td><td>{b.files.toLocaleString()}</td><td>{fmtBytes(b.bytes)}</td><td className="small">{fmtTime(b.last_at)}</td></tr>)}</tbody>
        </table>
      </div>
      <LimitsBox limits={s.limits} canEdit={can(me.role, 'editHealthLimits')} onSaved={l => setData({ ...s, limits: l })} />
    </div>
  );
}

/** Plan limits and AWS backup state (owner / admin; reason + second confirmation). */
function LimitsBox({ limits, canEdit, onSaved }: { limits: HealthLimits; canEdit: boolean; onSaved: (l: HealthLimits) => void }) {
  const { api } = useAdmin();
  const [draft, setDraft] = useState<{ db: string; files: string; aws: HealthLimits['aws_backup']; note: string } | null>(null);
  const [confirm, setConfirm] = useState<Partial<HealthLimits> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const start = () => setDraft({ db: String(limits.db_limit_mb), files: String(limits.storage_limit_mb), aws: limits.aws_backup, note: limits.aws_note ?? '' });
  const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  const patch: Partial<HealthLimits> = {};
  if (draft) {
    if (num(draft.db) !== limits.db_limit_mb) patch.db_limit_mb = num(draft.db);
    if (num(draft.files) !== limits.storage_limit_mb) patch.storage_limit_mb = num(draft.files);
    if (draft.aws !== limits.aws_backup) patch.aws_backup = draft.aws;
    if (draft.note.trim() !== (limits.aws_note ?? '')) patch.aws_note = draft.note.trim();
  }
  const valid = !draft || (num(draft.db) >= 1 && num(draft.files) >= 1);
  return (
    <div className="card stack" data-testid="limits">
      <h3>Plan limits used for the boxes</h3>
      <Kv rows={[
        { k: 'Database limit', v: `${limits.db_limit_mb.toLocaleString()} MB` },
        { k: 'Stored files limit', v: `${limits.storage_limit_mb.toLocaleString()} MB` },
        { k: 'AWS backup', v: limits.aws_backup === 'set_up' ? `Set up${limits.aws_note ? ` — ${limits.aws_note}` : ''}` : 'Not set up yet' },
        { k: 'Last changed', v: fmtTime(limits.updated_at) },
      ]} />
      <small className="muted">The database cannot see the Supabase plan, so enter the limits of your plan here (Supabase → Organization → Billing). Free plan: 500 MB database, 1,024 MB files.</small>
      {canEdit && !draft && <button className="btn" onClick={start} data-testid="limits-edit">Change…</button>}
      {draft && (
        <div className="stack">
          <div className="grid2">
            <label className="field"><span>Database limit (MB)</span><input type="text" inputMode="numeric" value={draft.db} onChange={e => setDraft({ ...draft, db: e.target.value })} data-testid="limit-db" /></label>
            <label className="field"><span>Stored files limit (MB)</span><input type="text" inputMode="numeric" value={draft.files} onChange={e => setDraft({ ...draft, files: e.target.value })} data-testid="limit-files" /></label>
          </div>
          <label className="field"><span>AWS backup</span>
            <select value={draft.aws} onChange={e => setDraft({ ...draft, aws: e.target.value as HealthLimits['aws_backup'] })} data-testid="limit-aws">
              <option value="not_set_up">Not set up yet</option><option value="set_up">Set up</option>
            </select></label>
          <label className="field"><span>AWS note (where, how often)</span><input type="text" maxLength={500} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
          {!valid && <small className="error">Limits must be whole numbers of 1 or more.</small>}
          <div className="row">
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button><span className="spacer" />
            <button className="btn gold" disabled={!valid || !Object.keys(patch).length} onClick={() => setConfirm(patch)} data-testid="limits-save">Save…</button>
          </div>
        </div>
      )}
      {done && <small role="status" className="gold">{done}</small>}
      {confirm && <ConfirmDialog title="Change plan limits" confirmLabel="Save limits" onClose={() => setConfirm(null)}
        body={<ul>{Object.entries(confirm).map(([k, v]) => <li key={k}><b>{k.replace(/_/g, ' ')}</b>: {String(v) || <i>cleared</i>}</li>)}</ul>}
        onConfirm={async reason => {
          try { onSaved(await api.setHealthLimits(confirm, reason)); } catch (e) { throw new Error(errText(e)); }
          setDraft(null); setDone('Limits saved.');
        }} />}
    </div>
  );
}

// ---------------------------------------------------------------- Backups (features 3 and 42)
function BackupsTab() {
  const { api, me } = useAdmin();
  const s = useLoad<StorageHealth>(() => api.healthStorage(), [api]);
  const t = useLoad<BackupTest[]>(() => api.backupTests(500), [api]);
  const [adding, setAdding] = useState(false);
  if (s.err) return <ErrorBox text={s.err} onRetry={() => void s.load()} />;
  if (t.err) return <ErrorBox text={t.err} onRetry={() => void t.load()} />;
  if (!s.data || !t.data) return <Loading />;
  const st = s.data, today = todayKL();
  const total = st.today.db_bytes + st.today.storage_bytes;
  const limit = (st.limits.db_limit_mb + st.limits.storage_limit_mb) * MB;
  const lastPass = st.backup_tests.last_restore_pass;
  const age = daysSince(lastPass?.tested_on, today);
  const overdue = age === null || age > RESTORE_TEST_DUE_DAYS;
  return (
    <div className="stack" data-testid="health-backups">
      <Head title="Backup status" checked={st.checked_at} onRefresh={() => { void s.load(); void t.load(); }} busy={s.busy || t.busy} />
      <div className="grid2">
        <Meter title="Supabase backup" used={total} limit={limit} testid="box-supabase"
          sub={<small className="muted">Database {fmtBytes(st.today.db_bytes)} + files {fmtBytes(st.today.storage_bytes)}. Supabase makes the backups according to your plan; the log below is the proof they restore.</small>} />
        <div className={`card boxed meter ${st.limits.aws_backup === 'set_up' ? 'ok' : 'amber'}`} data-testid="box-aws">
          <div className="row"><h3 className="spacer">AWS backup</h3><span className={`tag ${st.limits.aws_backup === 'set_up' ? 'ok' : 'amber'}`}>{st.limits.aws_backup === 'set_up' ? 'Set up' : 'Not set up yet'}</span></div>
          <p className="small muted" style={{ margin: 0 }}>{st.limits.aws_backup === 'set_up' ? (st.limits.aws_note ?? 'No details given.') : 'The second backup (AWS) has not been set up. When it is, mark it in Storage → Plan limits.'}</p>
          <small className="muted">AWS sizes cannot be read from here; record AWS checks in the log below.</small>
        </div>
      </div>
      <div className={`notice ${overdue ? 'warn' : 'ok'}`} data-testid="restore-due">
        {lastPass
          ? <>Last restore test that passed: <b>{lastPass.tested_on}</b> ({lastPass.ref}), {age} day{age === 1 ? '' : 's'} ago.{overdue && ' A new test is due (one a month is recommended).'}</>
          : <>No restore test has been recorded yet. Auditors expect proof that backups can be restored — record one after you test.</>}
      </div>
      <div className="row">
        <h3 className="spacer">Backup check and restore test log ({t.data.length})</h3>
        {can(me.role, 'recordBackupTest') && !adding && <button className="btn gold" onClick={() => setAdding(true)} data-testid="bt-add">Record a test…</button>}
      </div>
      {adding && <NewTest onClose={() => setAdding(false)} onSaved={r => { t.setData([r, ...(t.data ?? [])]); setAdding(false); void s.load(); }} />}
      <small className="muted">Kept for good: an entry cannot be changed or deleted after it is saved. Each one is also in the Master Audit Log.</small>
      {!t.data.length ? <p className="muted">Nothing recorded yet.</p> : (
        <div className="list" data-testid="bt-list">
          {t.data.map(r => (
            <div className="item stack" key={r.id} style={{ gap: 4 }}>
              <div className="row">
                <b className="spacer">{r.ref} · {r.tested_on}</b>
                <span className="tag">{TARGET_LABEL[r.target]}</span><span className="tag">{KIND_LABEL[r.kind]}</span>
                <span className={`tag ${r.result === 'pass' ? 'ok' : r.result === 'partial' ? 'amber' : 'red'}`}>{RESULT_LABEL[r.result]}</span>
              </div>
              <span>{r.what}</span>
              {r.notes && <small className="muted">{r.notes}</small>}
              <small className="muted">{r.duration_minutes != null ? `Took ${r.duration_minutes} min · ` : ''}Recorded {fmtTime(r.recorded_at)} by {r.recorded_by_email ?? r.recorded_by}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTest({ onClose, onSaved }: { onClose: () => void; onSaved: (r: BackupTest) => void }) {
  const { api } = useAdmin();
  const today = todayKL();
  const [f, setF] = useState<{ tested_on: string; target: BackupTarget; kind: BackupKind; result: BackupResult; what: string; mins: string; notes: string }>(
    { tested_on: today, target: 'supabase', kind: 'restore_test', result: 'pass', what: '', mins: '', notes: '' });
  const [confirm, setConfirm] = useState(false);
  const minsOk = !f.mins.trim() || (/^\d+$/.test(f.mins.trim()) && Number(f.mins) <= 10080);
  const ok = !!f.tested_on && f.tested_on <= today && f.what.trim().length >= 5 && minsOk;
  const body: NewBackupTest = { tested_on: f.tested_on, target: f.target, kind: f.kind, result: f.result, what: f.what.trim(),
    duration_minutes: f.mins.trim() ? Number(f.mins) : null, notes: f.notes.trim() || undefined };
  return (
    <div className="card boxed stack" data-testid="bt-form">
      <h3>Record a backup check or restore test</h3>
      <div className="grid2">
        <label className="field"><span>Date of the test</span><input type="date" max={today} value={f.tested_on} onChange={e => setF({ ...f, tested_on: e.target.value })} data-testid="bt-date" /></label>
        <label className="field"><span>Which backup</span>
          <select value={f.target} onChange={e => setF({ ...f, target: e.target.value as BackupTarget })} data-testid="bt-target">
            <option value="supabase">Supabase</option><option value="aws">AWS</option><option value="other">Other</option></select></label>
        <label className="field"><span>What kind</span>
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as BackupKind })} data-testid="bt-kind">
            <option value="restore_test">Restore test (restored a copy and checked it)</option><option value="backup_check">Backup check (confirmed a backup exists)</option></select></label>
        <label className="field"><span>Result</span>
          <select value={f.result} onChange={e => setF({ ...f, result: e.target.value as BackupResult })} data-testid="bt-result">
            <option value="pass">Passed</option><option value="partial">Partly passed</option><option value="fail">Failed</option></select></label>
      </div>
      <label className="field"><span>What was checked or restored (required)</span>
        <textarea maxLength={1000} value={f.what} onChange={e => setF({ ...f, what: e.target.value })} placeholder="e.g. Restored the 20 Oct backup into a scratch project and opened 10 listings and 5 photos" data-testid="bt-what" /></label>
      <div className="grid2">
        <label className="field"><span>How long it took (minutes, optional)</span><input type="text" inputMode="numeric" value={f.mins} onChange={e => setF({ ...f, mins: e.target.value })} data-testid="bt-mins" /></label>
        <label className="field"><span>Notes (optional)</span><input type="text" maxLength={2000} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      {!minsOk && <small className="error">Minutes must be a whole number.</small>}
      <div className="row">
        <button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
        <button className="btn gold" disabled={!ok} onClick={() => setConfirm(true)} data-testid="bt-save">Save…</button>
      </div>
      {confirm && <SaveTest body={body} onClose={() => setConfirm(false)} onSaved={r => onSaved(r)} save={() => api.backupTestAdd(body)} />}
    </div>
  );
}

/** A second confirmation before saving: the entry can never be changed afterwards. */
function SaveTest({ body, save, onClose, onSaved }: { body: NewBackupTest; save: () => Promise<BackupTest>; onClose: () => void; onSaved: (r: BackupTest) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="overlay" role="presentation">
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Save test record">
        <h2>Save this record?</h2>
        <Kv rows={[
          { k: 'Date', v: body.tested_on }, { k: 'Backup', v: TARGET_LABEL[body.target] }, { k: 'Kind', v: KIND_LABEL[body.kind] },
          { k: 'Result', v: RESULT_LABEL[body.result] }, { k: 'What', v: body.what },
        ]} />
        <div className="notice warn">It cannot be changed or deleted afterwards, and it is recorded with your name and the time.</div>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="row">
          <button className="btn" disabled={busy} onClick={onClose}>Back</button><span className="spacer" />
          <button className="btn gold" disabled={busy} data-testid="confirm-final" onClick={async () => {
            setBusy(true); setErr(null);
            try { onSaved(await save()); onClose(); } catch (e) { setErr(errText(e)); setBusy(false); }
          }}>{busy ? 'Saving…' : 'Save record'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sync (features 9 and 43)
function SyncTab() {
  const { api, me, go } = useAdmin();
  const [days, setDays] = useState(30);
  const allowed = can(me.role, 'viewHealthAgents');
  const { data: s, err, busy, load } = useLoad<SyncHealth | null>(() => (allowed ? api.syncHealth(days) : Promise.resolve(null)), [api, days, allowed]);
  if (!allowed) return <p className="notice">Sync failures name individual agents, so they are shown to the Owner, Admin and Compliance only.</p>;
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  const rate = failRate(s.totals.runs, s.totals.fails);
  return (
    <div className="stack" data-testid="health-sync">
      <Head title="Sync" checked={s.checked_at} onRefresh={() => void load()} busy={busy}>
        <DaysPicker days={days} onDays={setDays} />
      </Head>
      <div className="stats">
        <Stat label="Sync runs" value={s.totals.runs.toLocaleString()} sub={`last ${s.days} days`} />
        <Stat label="Failed" value={s.totals.fails.toLocaleString()} sub={fmtPct(rate)} level={rate === null ? undefined : rate > 10 ? 'red' : rate > 2 ? 'amber' : 'ok'} />
        <Stat label="Agents syncing" value={s.totals.agents} />
        <Stat label="Agents with a failure" value={s.totals.agents_failing} level={s.totals.agents_failing ? 'amber' : 'ok'} />
      </div>
      <div className="card"><Bars label="Sync runs per day" redLabel="failed" items={s.by_day.map(d => ({ label: d.day, value: d.runs, red: d.fails }))} /></div>
      <h3>Per agent (most failures first)</h3>
      {!s.agents.length ? <p className="muted">No agent synced in this period.</p> : (
        <div className="tablewrap">
          <table data-testid="sync-agents">
            <thead><tr><th>Agent</th><th>Runs</th><th>Failed</th><th>Last failure</th><th>Last good sync</th><th>Waiting to upload</th><th>Phone / app</th></tr></thead>
            <tbody>{s.agents.map(a => (
              <tr key={a.user_id}>
                <td><button className="linkbtn" onClick={() => go({ k: 'agent', id: a.user_id })}>{a.name || a.email}</button><br /><small className="muted">{a.email}</small></td>
                <td>{a.runs}</td>
                <td>{a.fails ? <span className="tag red">{a.fails} ({fmtPct(failRate(a.runs, a.fails), 0)})</span> : '0'}</td>
                <td className="small">{fmtTime(a.last_fail) || <span className="muted">—</span>}</td>
                <td className="small">{fmtTime(a.last_ok) || <span className="tag amber">none</span>}</td>
                <td>{a.pending == null ? <span className="muted">—</span> : <span className={a.pending > 20 ? 'tag amber' : ''}>{a.pending}</span>}</td>
                <td className="small">{platformLabel(a.platform)} {a.app_version ?? ''}<br />{a.phones ? `${a.phones} phone${a.phones === 1 ? '' : 's'} for push` : <span className="muted">no push phone</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <small className="muted">From the main app's sync log. “Waiting to upload” is the number of changes on the agent's device not yet saved to the cloud, at its last report. This list is recorded in the access log.</small>
    </div>
  );
}

function DaysPicker({ days, onDays }: { days: number; onDays: (d: number) => void }) {
  return (
    <select value={days} onChange={e => onDays(Number(e.target.value))} aria-label="Period" style={{ width: 'auto', minHeight: 36 }} data-testid="days">
      {[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
    </select>
  );
}

// ---------------------------------------------------------------- Push (feature 44)
function PushTab() {
  const { api } = useAdmin();
  const { data: p, err, busy, load } = useLoad<PushHealth>(() => api.pushHealth(), [api]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!p) return <Loading />;
  const reach = pct(p.agents_with_phone, p.agents);
  const others = Object.entries(p.other_pushes_30d);
  return (
    <div className="stack" data-testid="health-push">
      <Head title="Push notifications" checked={p.checked_at} onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Agents who can get a push" value={`${p.agents_with_phone} of ${p.agents}`} sub={fmtPct(reach, 0)} level={reach < 50 ? 'amber' : 'ok'} />
        {p.phones.map(ph => <Stat key={ph.platform} label={`${platformLabel(ph.platform)} phones`} value={ph.phones} sub={`${ph.agents} agent${ph.agents === 1 ? '' : 's'}`} />)}
        {others.map(([k, n]) => <Stat key={k} label={`Other pushes (30 days): ${k.replace(/_/g, ' ')}`} value={n} />)}
      </div>
      <h3>Broadcasts</h3>
      {!p.broadcasts.length ? <p className="muted" data-testid="no-broadcasts">No broadcast has been sent yet. Sent / delivered / opened will show here for each one.</p> : (
        <div className="tablewrap">
          <table data-testid="broadcasts">
            <thead><tr><th>Post</th><th>Status</th><th>Aimed at</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Failed</th></tr></thead>
            <tbody>{p.broadcasts.map(b => {
              const sent = b.sent ?? 0;
              return (
                <tr key={b.item_id}>
                  <td>{b.title || <span className="muted">(no title)</span>}<br /><small className="muted">{fmtTime(b.queued_at)}</small></td>
                  <td><span className={`tag ${b.status === 'done' ? 'ok' : 'amber'}`}>{b.status}</span></td>
                  <td>{b.targeted ?? '—'}{b.no_phone ? <><br /><small className="muted">{b.no_phone} no phone</small></> : null}</td>
                  <td>{sent}</td>
                  <td>{b.received} <small className="muted">{fmtPct(pct(b.received, sent), 0)}</small></td>
                  <td>{b.opened} <small className="muted">{fmtPct(pct(b.opened, sent), 0)}</small></td>
                  <td>{b.failed ? <span className="tag red" title={Object.entries(b.errors).map(([e, n]) => `${e}: ${n}`).join(', ')}>{b.failed}</span> : '0'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <small className="muted">“Delivered” and “opened” are reported back by the agent's phone, so they can rise for a while after sending.</small>
    </div>
  );
}

// ---------------------------------------------------------------- Performance (feature 39)
function PerformanceTab() {
  const { api } = useAdmin();
  const [days, setDays] = useState(30);
  const { data: p, err, busy, load } = useLoad<Performance>(() => api.performance(days), [api, days]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!p) return <Loading />;
  const s = p.startup_all;
  const lvl = (ms: number | null) => (ms === null ? undefined : ms > 8000 ? 'red' : ms > 4000 ? 'amber' : 'ok') as 'ok' | 'amber' | 'red' | undefined;
  return (
    <div className="stack" data-testid="health-performance">
      <Head title="App performance" checked={p.checked_at} onRefresh={() => void load()} busy={busy}><DaysPicker days={days} onDays={setDays} /></Head>
      <div className="stats">
        <Stat label="App start (typical)" value={fmtMs(s.p50_ms)} sub={`${s.opens} opens measured`} level={lvl(s.p50_ms)} />
        <Stat label="App start (slowest 10%)" value={fmtMs(s.p90_ms)} level={lvl(s.p90_ms)} />
        <Stat label="Google calls" value={p.google_calls.calls.toLocaleString()} sub={`${p.google_calls.failed} failed`} level={p.google_calls.failed ? 'amber' : 'ok'} />
        <Stat label="Crash-free rate" value="—" sub="Needs crash reporting in the main app (tool not chosen yet)" />
      </div>
      <div className="card"><Bars label="App opens per day" items={p.sessions_by_day.map(d => ({ label: d.day, value: d.sessions }))} /></div>
      <h3>Start time by version</h3>
      {!p.startup.length ? <p className="muted">No start times recorded in this period.</p> : (
        <div className="tablewrap">
          <table data-testid="startup">
            <thead><tr><th>Version</th><th>Device</th><th>Opens</th><th>Typical</th><th>Slowest 10%</th><th>Slowest</th></tr></thead>
            <tbody>{p.startup.map(r => <tr key={r.app_version + r.platform}><td>{r.app_version}</td><td>{platformLabel(r.platform)}</td><td>{r.opens}</td><td>{fmtMs(r.p50_ms)}</td><td>{fmtMs(r.p90_ms)}</td><td>{fmtMs(r.max_ms)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <h3>Versions in use</h3>
      <div className="row">{p.versions.map(v => <span className="tag" key={v.app_version}>{v.app_version}: {v.agents} agent{v.agents === 1 ? '' : 's'}</span>)}</div>
      <small className="muted">Start time is measured by the main app from launch until the home screen is ready. Slow screens need screen timings, which the main app does not record yet.</small>
    </div>
  );
}

// ---------------------------------------------------------------- Problems (feature 5)
const REPORT_LABEL: Record<ReportStatus, string> = { new: 'New', seen: 'Seen', fixed: 'Fixed', closed: 'Closed' };
function ErrorsTab() {
  const { api, me, go } = useAdmin();
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const allowed = can(me.role, 'viewHealthAgents');
  const { data: r, err, busy, load } = useLoad<ErrorReports | null>(() => (allowed ? api.errorReports(status) : Promise.resolve(null)), [api, status, allowed]);
  if (!allowed) return <p className="notice">Problem reports name the agents who sent them, so they are shown to the Owner, Admin and Compliance only.</p>;
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!r) return <Loading />;
  return (
    <div className="stack" data-testid="health-errors">
      <Head title="Problems and errors" checked={r.checked_at} onRefresh={() => void load()} busy={busy} />
      <div className="notice warn small">Automatic crash reports are not collected yet: the main app needs a crash-reporting tool first (not chosen). Shown here: problems agents reported, and failures the app recorded.</div>
      <h3>Failures recorded in the last 7 days</h3>
      {!r.failures_7d.length ? <p className="muted" data-testid="no-failures">None.</p> : (
        <div className="tablewrap">
          <table data-testid="failures">
            <thead><tr><th>What</th><th>Failed</th><th>Of</th><th>Agents</th><th>Last</th></tr></thead>
            <tbody>{r.failures_7d.map(f => <tr key={f.kind + f.name}><td className="mono">{f.name}</td><td><span className="tag red">{f.failed}</span></td><td>{f.total}</td><td>{f.agents}</td><td className="small">{fmtTime(f.last_at)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="row">
        <h3 className="spacer">Problem reports from agents</h3>
        <div className="tabs" role="group" aria-label="Report status" style={{ margin: 0 }}>
          <button aria-pressed={status === null} onClick={() => setStatus(null)}>All</button>
          {(Object.keys(REPORT_LABEL) as ReportStatus[]).map(k => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{REPORT_LABEL[k]} ({r.counts[k] ?? 0})</button>)}
        </div>
      </div>
      {!r.reports.length ? <p className="muted" data-testid="no-reports">No reports{status ? ` marked “${REPORT_LABEL[status]}”` : ''}.</p> : (
        <div className="list" data-testid="reports">
          {r.reports.map(x => (
            <div className="item stack" key={x.id} style={{ gap: 4 }}>
              <div className="row"><b className="spacer">{fmtTime(x.created_at)}</b><span className={`tag ${x.status === 'new' ? 'amber' : x.status === 'fixed' ? 'ok' : ''}`}>{REPORT_LABEL[x.status]}</span></div>
              <span>{x.description}</span>
              <small className="muted">
                <button className="linkbtn" onClick={() => go({ k: 'agent', id: x.user_id })}>{x.email ?? x.user_id}</button>
                {' · '}{platformLabel(x.platform)} {x.app_version ?? ''}{x.screen ? ` · screen “${x.screen}”` : ''}{x.has_screenshot ? ' · screenshot attached' : ''}
              </small>
            </div>
          ))}
        </div>
      )}
      <small className="muted">Changing a report's status belongs to Support Tickets (feature 65), not built yet. This list is recorded in the access log.</small>
    </div>
  );
}

// ---------------------------------------------------------------- export for auditors
function HealthExport() {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format); setMsg(null);
    try { const r = await exportHealthReport(api, me.email, format, todayKL()); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="row">
      <small className="muted">Report for auditors:</small>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('pdf')} data-testid="health-pdf">{busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn small gold" disabled={!!busy} onClick={() => void run('xlsx')} data-testid="health-xlsx">{busy === 'xlsx' ? 'Making…' : 'Excel'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="health-export-msg">{msg.text}</small>}
    </div>
  );
}
