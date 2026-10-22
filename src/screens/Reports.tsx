// AdminBatch008 — Scheduled Reports (feature 70), Joe 22 Oct 2026: every week the summary PDF (totals only, no agent
// names) is made, kept in the vault for 7 years (never changed or deleted) and emailed to the Owner / Compliance admins
// chosen here. Owner switches it on / off and chooses the day, hour and who gets it; Owner and Compliance can make one now.
import { useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { ReportRun, ReportSettings } from '../api/admin';
import { REPORT_STATUS, WEEKDAYS } from '../admin/comms';
import { fmtTime } from '../export/reports';
import { shortFp } from '../export/pack';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

export function ReportsScreen() {
  const { api, me } = useAdmin();
  const owner = can(me.role, 'reportSchedule');
  const [s, setS] = useState<ReportSettings | null>(null);
  const [runs, setRuns] = useState<ReportRun[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{ enabled: boolean; weekday: number; hour: number; recipients: string[] } | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'run' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dl, setDl] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, b] = await Promise.all([api.reportSettings(), api.reports()]);
      setS(a); setRuns(b); setForm({ enabled: a.enabled, weekday: a.weekday, hour: a.hour, recipients: a.recipients });
    } catch (e) { setErr(errText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s || !runs || !form) return <Loading />;
  const changed = form.enabled !== s.enabled || form.weekday !== s.weekday || form.hour !== s.hour || form.recipients.join() !== s.recipients.join();
  const download = async (r: ReportRun) => {
    setDl(null);
    try {
      const d = await api.reportDownload(r.id);
      const blob = await api.files.download(d.path);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = d.file_name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) { setDl(errText(e)); }
  };
  return (
    <div className="stack" data-testid="reports">
      <h1>Scheduled reports</h1>
      <p className="muted small" style={{ margin: 0 }}>A one-page weekly summary (agents, listings, operations, Admin EAB activity, audit-log check). Totals only, no agent names.
        Each report is kept in the vault for 7 years and cannot be changed or deleted. Emails go out only once the email service is set up on the server.</p>
      <div className="card boxed stack" data-testid="report-settings">
        <h3>Every week</h3>
        <label className="choice"><input type="checkbox" checked={form.enabled} disabled={!owner} onChange={e => setForm({ ...form, enabled: e.target.checked })} data-testid="rep-on" /> Make and send the weekly report</label>
        <div className="row">
          <label className="field"><span>Day</span>
            <select value={form.weekday} disabled={!owner} onChange={e => setForm({ ...form, weekday: Number(e.target.value) })} data-testid="rep-day">
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          <label className="field"><span>From (Malaysia time)</span>
            <select value={form.hour} disabled={!owner} onChange={e => setForm({ ...form, hour: Number(e.target.value) })} data-testid="rep-hour">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        </div>
        <small className="muted">It covers the week before (Monday to Sunday).</small>
        <b>Who gets it (Owner and Compliance only)</b>
        {s.can_receive.map(a => (
          <label key={a.user_id} className="choice"><input type="checkbox" disabled={!owner} checked={form.recipients.includes(a.user_id)}
            onChange={e => setForm({ ...form, recipients: e.target.checked ? [...form.recipients, a.user_id] : form.recipients.filter(x => x !== a.user_id) })} data-testid="rep-who" /> {a.email} <span className="muted small">({a.role})</span></label>
        ))}
        {owner ? (
          <div className="row"><span className="spacer" />
            <button className="btn gold" disabled={!changed || (form.enabled && form.recipients.length === 0)} onClick={() => setConfirm('save')} data-testid="rep-save">Save…</button></div>
        ) : <small className="muted">Only the Owner can change this.</small>}
      </div>
      <div className="row"><h2 className="spacer">Reports</h2>
        <button className="btn" onClick={() => setConfirm('run')} data-testid="rep-run">Make one now…</button></div>
      {msg && <p className="notice ok" role="status" data-testid="rep-msg">{msg}</p>}
      {dl && <p className="error" role="alert">{dl}</p>}
      {runs.length === 0 ? <p className="muted">No reports yet.</p> : (
        <div className="tablewrap"><table data-testid="rep-list">
          <thead><tr><th>Week</th><th>Made</th><th>State</th><th>Emailed to</th><th>Fingerprint</th><th /></tr></thead>
          <tbody>{runs.map(r => (
            <tr key={r.id} data-testid="rep-row">
              <td>{r.period_from} – {r.period_to}<br /><small className="muted">{r.ref}{r.trigger === 'manual' ? ' (by hand)' : ''}</small></td>
              <td>{fmtTime(r.created_at)}<br /><small className="muted">{r.started_by_email ?? ''}</small></td>
              <td><span className={`tag ${r.status === 'failed' ? 'red' : r.status === 'making' ? 'amber' : 'ok'}`}>{REPORT_STATUS[r.status]}</span>
                {r.error && <><br /><small className="muted">{r.error}</small></>}</td>
              <td className="small">{r.emailed_to.join(', ') || <span className="muted">—</span>}</td>
              <td className="mono small">{r.sha256 ? shortFp(r.sha256) : ''}</td>
              <td>{(r.status === 'stored' || r.status === 'emailed') && <button className="btn small" onClick={() => void download(r)} data-testid="rep-dl">PDF</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {confirm === 'save' && (
        <ConfirmDialog title="Change the weekly report" confirmLabel="Save"
          body={<>{form.enabled ? <>Every <b>{WEEKDAYS[form.weekday - 1]}</b> from <b>{String(form.hour).padStart(2, '0')}:00</b>, to {form.recipients.length} admin{form.recipients.length === 1 ? '' : 's'}.</> : <>The weekly report will be <b>switched off</b>.</>}</>}
          onConfirm={async reason => { await api.reportSettingsSave(form, reason); await load(); }} onClose={() => setConfirm(null)} />
      )}
      {confirm === 'run' && (
        <ConfirmDialog title="Make the report now" confirmLabel="Make it"
          body={<>The summary of last week is made now, kept in the vault and emailed to the chosen admins (if email is set up).</>}
          onConfirm={async reason => {
            if (!api.files.runReport) throw new Error('not available');
            const r = await api.files.runReport(reason);
            setMsg(r.run ? `${r.run.ref}: ${REPORT_STATUS[r.run.status]}${r.run.error ? ` — ${r.run.error}` : ''}.` : 'Done.');
            await load();
          }} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}
