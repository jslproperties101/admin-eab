// Admins & Roles (feature 17), Owner only. Add a Google account to Admin EAB, change its role, switch it off, or give a
// regulator temporary access with an expiry date. Every change needs a reason and a second confirmation (feature 76)
// and is written to the Master Audit Log by the database.
import { adminName } from '../apps';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AdminRow } from '../api/admin';
import { ALL_ROLES, ROLE_HELP, ROLE_LABEL, Role } from '../admin/roles';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

interface Draft { email: string; role: Role; active: boolean; expires: string }

export function AdminsScreen() {
  const { api, me } = useAdmin();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ email: '', role: 'viewer', active: true, expires: '' });
  const [confirm, setConfirm] = useState<Draft | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api.admins()); } catch (e) { setErr(errText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const needsExpiry = draft.role === 'regulator';
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim()) && (!needsExpiry || !!draft.expires);

  return (
    <div className="stack">
      <h1>Admins & Roles</h1>
      <p className="muted" style={{ margin: 0 }}>Only Google accounts on this list can open {adminName()}. The person must have signed in once (to the main app or {adminName()}) before they can be added.</p>
      {err && <ErrorBox text={err} onRetry={() => void load()} />}
      {!rows && !err && <Loading />}
      {rows && (
        <div className="tablewrap">
          <table data-testid="admins-table">
            <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Access ends</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.user_id}>
                  <td>{a.email}{a.user_id === me.user_id && <span className="muted"> (you)</span>}</td>
                  <td>{ROLE_LABEL[a.role]}</td>
                  <td>{a.active ? <span className="tag ok">Active</span> : <span className="tag red">Off</span>}</td>
                  <td>{a.expires_at ? fmtTime(a.expires_at) : '—'}</td>
                  <td>{fmtTime(a.added_at)}</td>
                  <td><button className="btn small" onClick={() => setDraft({ email: a.email, role: a.role, active: a.active, expires: a.expires_at ? a.expires_at.slice(0, 16) : '' })}>Change</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card boxed stack">
        <h2>Add or change an admin</h2>
        <label className="field"><span>Google email</span>
          <input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="name@gmail.com" data-testid="admin-email" /></label>
        <label className="field"><span>Role</span>
          <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as Role })} data-testid="admin-role">
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select></label>
        <small className="muted">{ROLE_HELP[draft.role]}</small>
        <label className="field"><span>Access ends {needsExpiry ? '(required for a regulator)' : '(optional)'}</span>
          <input type="datetime-local" value={draft.expires} onChange={e => setDraft({ ...draft, expires: e.target.value })} /></label>
        <label className="row"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active (untick to switch this admin off)</label>
        {needsExpiry && <p className="notice warn" style={{ margin: 0 }}>A regulator sees nothing until they are given a case scope (named agents and dates). Case files come in a later batch.</p>}
        <button className="btn gold" disabled={!valid} onClick={() => setConfirm(draft)} data-testid="admin-save">Save…</button>
        {done && <small role="status" className="gold">{done}</small>}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Confirm admin change"
          body={<p>{confirm.email} → <b>{ROLE_LABEL[confirm.role]}</b>, {confirm.active ? 'active' : 'switched off'}{confirm.expires ? `, access ends ${confirm.expires.replace('T', ' ')}` : ''}.</p>}
          confirmLabel="Save change"
          danger={!confirm.active || confirm.role === 'owner'}
          onClose={() => setConfirm(null)}
          onConfirm={async reason => {
            try {
              const expires = confirm.expires ? new Date(confirm.expires).toISOString() : null;
              await api.setAdmin(confirm.email.trim(), confirm.role, confirm.active, expires, reason);
            } catch (e) { throw new Error(errText(e)); }
            setDone(`Saved ${confirm.email}.`);
            setDraft({ email: '', role: 'viewer', active: true, expires: '' });
            await load();
          }}
        />
      )}
    </div>
  );
}
