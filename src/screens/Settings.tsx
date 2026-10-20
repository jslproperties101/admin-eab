// System Settings (feature 11) — values shared with the main app (eab_settings, MainForAdmin-B):
//   company name      used everywhere in the main app, including the Terms and Conditions
//   support email     shown to suspended / banned agents and for data deletion requests (written to the company)
//   business address  in the Terms and Conditions
// Owner and Admin can change them (reason + second confirmation, recorded in the Master Audit Log).
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { Settings } from '../api/admin';
import { can } from '../admin/roles';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Kv, Loading } from './ui';

type Draft = { company_name: string; support_email: string; business_address: string };

export function SettingsScreen() {
  const { api, me } = useAdmin();
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Partial<Draft> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const edit = can(me.role, 'editSettings');

  const load = useCallback(async () => {
    setErr(null);
    try { setS(await api.settings()); } catch (e) { setErr(errText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s) return <Loading />;
  const startEdit = () => setDraft({ company_name: s.company_name, support_email: s.support_email ?? '', business_address: s.business_address ?? '' });
  const changes = draft ? (Object.keys(draft) as (keyof Draft)[]).reduce<Partial<Draft>>((acc, k) => {
    const before = (s[k] ?? '') as string;
    if (draft[k].trim() !== before) acc[k] = draft[k].trim();
    return acc;
  }, {}) : {};
  const emailOk = !draft || !draft.support_email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.support_email.trim());
  const nameOk = !draft || draft.company_name.trim().length > 0;

  return (
    <div className="stack">
      <h1>System Settings</h1>
      <p className="muted" style={{ margin: 0 }}>Shared with Estate Agent AI Buddy. A change shows in the main app the next time it opens or syncs.</p>
      <div className="card boxed stack" data-testid="settings">
        <Kv rows={[
          { k: 'Company name', v: s.company_name },
          { k: 'Support email', v: s.support_email ?? <span className="tag amber">Not set — suspended agents see “contact details coming soon”</span> },
          { k: 'Business address', v: s.business_address ?? <span className="tag amber">Not set</span> },
          { k: 'Last changed', v: fmtTime(s.updated_at) },
        ]} />
        {edit && !draft && <button className="btn gold" onClick={startEdit} data-testid="settings-edit">Change…</button>}
        {!edit && <small className="muted">Only the Owner or an Admin can change these.</small>}
      </div>
      {draft && (
        <div className="card boxed stack">
          <label className="field"><span>Company name (required)</span>
            <input type="text" value={draft.company_name} maxLength={200} onChange={e => setDraft({ ...draft, company_name: e.target.value })} data-testid="set-company" /></label>
          <label className="field"><span>Support email (leave empty to clear)</span>
            <input type="email" value={draft.support_email} maxLength={320} onChange={e => setDraft({ ...draft, support_email: e.target.value })} data-testid="set-email" /></label>
          {!emailOk && <small className="error">That does not look like an email address.</small>}
          <label className="field"><span>Business address (leave empty to clear)</span>
            <textarea value={draft.business_address} maxLength={500} onChange={e => setDraft({ ...draft, business_address: e.target.value })} data-testid="set-address" /></label>
          <div className="row">
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            <span className="spacer" />
            <button className="btn gold" disabled={!Object.keys(changes).length || !emailOk || !nameOk} onClick={() => setConfirm(changes)} data-testid="settings-save">Save…</button>
          </div>
        </div>
      )}
      {done && <small role="status" className="gold">{done}</small>}
      {confirm && (
        <ConfirmDialog
          title="Change shared settings"
          body={<ul>{Object.entries(confirm).map(([k, v]) => <li key={k}><b>{k.replace('_', ' ')}</b>: {v ? v : <i>cleared</i>}</li>)}</ul>}
          confirmLabel="Save settings"
          onClose={() => setConfirm(null)}
          onConfirm={async reason => {
            try { setS(await api.setSettings(confirm, reason)); } catch (e) { throw new Error(errText(e)); }
            setDraft(null); setDone('Settings saved.');
          }}
        />
      )}
    </div>
  );
}
