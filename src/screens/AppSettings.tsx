// AdminBatch010: Announcement banner, Maintenance mode and App release (minimum version + update link) for On Da Way,
// MM2H and AI Buddy Biz. The apps read these at start-up with eab_app_status. Owner / Admin change them with a reason;
// everyone else with access sees them read-only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { can } from '../admin/roles';
import { AppCalls, AppSettings } from '../api/apps';
import { bizApi, useBiz } from '../api/biz';
import { ConfirmDialog, ErrorBox, Loading } from './ui';
import { BizGate } from './BizGate';

export function AppSettingsScreen({ app, title }: { app: 'odw' | 'mm2h' | 'biz'; title: string }) {
  if (app === 'biz') return <BizGate><BizSettings title={title} /></BizGate>;
  return <EabSettings app={app} title={title} />;
}
function EabSettings({ app, title }: { app: 'odw' | 'mm2h'; title: string }) {
  const { apps, me } = useAdmin();
  return <SettingsForm calls={apps} role={me.role} app={app} title={title} />;
}
function BizSettings({ title }: { title: string }) {
  const { device } = useAdmin();
  const biz = useBiz();
  const calls = useMemo(() => bizApi(device), [device]);
  return <SettingsForm calls={calls} role={biz.me!.role} app="biz" title={title} />;
}

const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function SettingsForm({ calls, role, app, title }: { calls: AppCalls; role: string; app: 'odw' | 'mm2h' | 'biz'; title: string }) {
  const edit = can(role as Parameters<typeof can>[0], 'appManage');
  const [s, setS] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<AppSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await calls.view(app, 'settings');
      const v = r.summary as unknown as AppSettings;
      setS(v); setForm({ ...v, announcement_until: toLocal(v.announcement_until) });
    } catch (e) { setErr(errText(e)); }
  }, [calls, app]);
  useEffect(() => { void load(); }, [load]);

  if (err && !s) return <ErrorBox text={err} onRetry={load} />;
  if (!s || !form) return <Loading />;
  const f = form;
  const set = (patch: Partial<AppSettings>) => setForm({ ...f, ...patch });
  const changed = (['maintenance_on', 'maintenance_message', 'min_version', 'update_url', 'announcement'] as const)
    .some(k => (f[k] ?? '') !== (s[k] ?? '')) || (f.announcement_until ?? '') !== toLocal(s.announcement_until);
  const problem = f.update_url && !/^https:\/\//.test(f.update_url) ? 'The update link must start with https://'
    : f.min_version && !/^\d+(\.\d+){0,3}$/.test(f.min_version) ? 'Minimum version looks like 1.2.0' : null;

  return (
    <div className="stack">
      <h1>{title}</h1>
      <p className="muted">These settings are read by the app each time it starts. {edit ? 'Changes need a reason and are recorded in the log.' : 'Read-only for your role.'}</p>
      {msg && <p className="notice ok" role="status" data-testid="settings-msg">{msg}</p>}
      {s.maintenance_on && <p className="notice warn" data-testid="maint-on">Maintenance is ON — the app is closed for users.</p>}

      <fieldset className="card boxed stack" disabled={!edit}>
        <legend><h2>Maintenance mode</h2></legend>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.maintenance_on} onChange={e => set({ maintenance_on: e.target.checked })} data-testid="maint-toggle" /> Close the app for users now</label>
        <label className="field"><span>Message users see</span><textarea value={f.maintenance_message ?? ''} maxLength={500} onChange={e => set({ maintenance_message: e.target.value })} placeholder="e.g. Back by 6pm today." data-testid="maint-msg" /></label>
      </fieldset>

      <fieldset className="card boxed stack" disabled={!edit}>
        <legend><h2>App release</h2></legend>
        <label className="field"><span>Minimum version (older versions are asked to update)</span><input value={f.min_version ?? ''} onChange={e => set({ min_version: e.target.value })} placeholder="1.2.0" data-testid="min-version" /></label>
        <label className="field"><span>Update link</span><input value={f.update_url ?? ''} onChange={e => set({ update_url: e.target.value })} placeholder="https://…" data-testid="update-url" /></label>
      </fieldset>

      <fieldset className="card boxed stack" disabled={!edit}>
        <legend><h2>Announcement banner</h2></legend>
        <label className="field"><span>Banner text (empty = no banner)</span><textarea value={f.announcement ?? ''} maxLength={500} onChange={e => set({ announcement: e.target.value })} data-testid="banner" /></label>
        <label className="field"><span>Show until (optional)</span><input type="datetime-local" value={f.announcement_until ?? ''} onChange={e => set({ announcement_until: e.target.value })} /></label>
      </fieldset>

      {problem && <p className="error" role="alert">{problem}</p>}
      {err && <ErrorBox text={err} />}
      {edit && <div className="row"><button className="btn gold" disabled={!changed || !!problem} onClick={() => { setMsg(null); setConfirm(true); }} data-testid="settings-save">Save</button></div>}
      {s.updated_at && <p className="small muted">Last changed {new Date(s.updated_at).toLocaleString('en-MY')}.</p>}

      {confirm && <ConfirmDialog title="Save app settings" danger={f.maintenance_on && !s.maintenance_on}
        body={f.maintenance_on && !s.maintenance_on ? 'This closes the app for every user until you switch maintenance off.' : 'The app will use these at its next start.'}
        confirmLabel="Save" onClose={() => setConfirm(false)}
        onConfirm={async reason => {
          const patch: Partial<AppSettings> = {
            maintenance_on: f.maintenance_on, maintenance_message: f.maintenance_message ?? '', min_version: f.min_version ?? '',
            update_url: f.update_url ?? '', announcement: f.announcement ?? '',
            announcement_until: f.announcement_until ? new Date(f.announcement_until).toISOString() : '',
          };
          await calls.setSettings(app, patch, reason);
          setMsg('Saved.'); await load();
        }} />}
    </div>
  );
}
