// Master Audit Log (feature 18: what admins DID) and Who Viewed What (feature 74: what admins SAW, searched or
// exported), with the integrity check (feature 73) that re-computes the hash chain of both logs.
import { adminName } from '../apps';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { AccessRow, ActionRow, ChainCheck } from '../api/admin';
import { fmtTime } from '../export/reports';
import { ErrorBox, Loading } from './ui';

const KIND: Record<string, string> = {
  sign_in: 'Signed in', search: 'Searched', view_agent: 'Opened agent', view_records: 'Listed records', view_history: 'Opened history',
  view_actions: 'Read audit log', view_access: 'Read access log', verify_chain: 'Checked log integrity', export: 'Exported',
};

export function LogsScreen({ tab, target }: { tab: 'actions' | 'access'; target?: string }) {
  const { api, go } = useAdmin();
  const [rows, setRows] = useState<(ActionRow | AccessRow)[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [check, setCheck] = useState<{ actions: ChainCheck; access: ChainCheck } | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (before: number | null = null) => {
    setErr(null);
    try {
      const page = await api.log(tab, target ?? null, 100, before);
      setRows(r => (before && r ? [...r, ...page] : page));
      setMore(page.length === 100);
    } catch (e) { setErr(errText(e)); }
  }, [api, tab, target]);
  useEffect(() => { void load(); }, [load]);

  const verify = async () => {
    setChecking(true); setErr(null);
    try { setCheck(await api.verify()); } catch (e) { setErr(errText(e)); } finally { setChecking(false); }
  };

  return (
    <div className="stack">
      <div className="row">
        <h1 className="spacer">{tab === 'actions' ? 'Master Audit Log' : 'Who Viewed What'}</h1>
        <button className="btn" onClick={() => void verify()} disabled={checking} data-testid="verify">{checking ? 'Checking…' : 'Check log integrity'}</button>
      </div>
      <div className="tabs">
        <button aria-pressed={tab === 'actions'} onClick={() => go({ k: 'logs', tab: 'actions', target })}>Admin actions</button>
        <button aria-pressed={tab === 'access'} onClick={() => go({ k: 'logs', tab: 'access', target })}>Views, searches & exports</button>
      </div>
      {target && <p className="notice">Showing entries about one agent only (<span className="mono">{target}</span>).</p>}
      {check && <ChainResult c={check} />}
      <p className="small muted" style={{ margin: 0 }}>Entries can never be changed or deleted. Each entry carries a fingerprint of the one before it, so any change made outside the app is detected by the integrity check.</p>
      {err && <ErrorBox text={err} onRetry={() => void load()} />}
      {!rows && !err && <Loading />}
      {rows && rows.length === 0 && <p className="muted">No entries yet.</p>}
      {rows && rows.length > 0 && (
        <div className="tablewrap">
          <table data-testid="log-table">
            <thead><tr><th>#</th><th>When</th><th>Admin</th><th>{tab === 'actions' ? 'Action' : 'What'}</th><th>About</th><th>{tab === 'actions' ? 'Reason' : 'Detail'}</th><th>Device</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.seq}>
                  <td>{r.seq}</td>
                  <td>{fmtTime(r.at)}</td>
                  <td>{r.admin_email}<br /><small className="muted">{r.admin_role}</small></td>
                  <td>{'action' in r ? r.action : KIND[r.kind] ?? r.kind}</td>
                  <td>{r.target_ref ?? ''}{r.target_user && <><br /><button className="linkbtn" onClick={() => go({ k: 'agent', id: r.target_user! })}>open agent</button></>}</td>
                  <td>{'action' in r ? r.reason : r.detail ? <span className="mono">{JSON.stringify(r.detail)}</span> : ''}</td>
                  <td><small className="muted">{r.device}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && rows && <button className="btn" onClick={() => void load(rows[rows.length - 1].seq)}>Load older entries</button>}
    </div>
  );
}

function ChainResult({ c }: { c: { actions: ChainCheck; access: ChainCheck } }) {
  const ok = c.actions.ok && c.access.ok;
  const line = (name: string, x: ChainCheck) => x.ok ? `${name}: ${x.checked} entries, all intact.` : `${name}: BROKEN at entry #${x.first_bad_seq} (checked ${x.checked}).`;
  return (
    <div className={`notice ${ok ? 'ok' : 'error'}`} role="status" data-testid="chain-result">
      <b>{ok ? 'Both logs are intact.' : `WARNING: a log entry was changed outside ${adminName()}.`}</b><br />
      {line('Admin actions', c.actions)}<br />{line('Views, searches & exports', c.access)}
    </div>
  );
}
