// AdminBatch008 — Team Workspaces overview (feature 69), read only: every agent's own workspace (who owns it, members,
// how many records) and every Team Workspace the agents made between themselves (leader, members, when they joined or
// left). Opening it is recorded. The records themselves are opened in the Agent Profile Viewer.
import { useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { TeamRow, WorkspaceDetail, WorkspaceRow } from '../api/admin';
import { labelOf } from '../export/reports';
import { fmtTime } from '../export/reports';
import { ErrorBox, Kv, Loading } from './ui';

export function WorkspacesScreen() {
  const { api, go } = useAdmin();
  const [q, setQ] = useState(''); const [query, setQuery] = useState('');
  const [data, setData] = useState<{ workspaces: WorkspaceRow[]; teams: TeamRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'teams' | 'workspaces'>('teams');
  const load = useCallback(async () => { setErr(null); setData(null); try { setData(await api.workspaces(query || null)); } catch (e) { setErr(errText(e)); } }, [api, query]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="stack" data-testid="workspaces">
      <h1>Team Workspaces</h1>
      <p className="muted small" style={{ margin: 0 }}>Read only. Opening this list is recorded.</p>
      <form className="row" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input className="spacer" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or email of a member" data-testid="ws-q" />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="tabs" role="group" aria-label="Show">
        <button aria-pressed={tab === 'teams'} onClick={() => setTab('teams')} data-testid="ws-tab-teams">Team Workspaces{data ? ` (${data.teams.length})` : ''}</button>
        <button aria-pressed={tab === 'workspaces'} onClick={() => setTab('workspaces')} data-testid="ws-tab-own">Agents’ own workspaces{data ? ` (${data.workspaces.length})` : ''}</button>
      </div>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : tab === 'teams' ? (
        data.teams.length === 0 ? <p className="muted">No Team Workspaces.</p> : (
          <div className="stack" data-testid="team-list">
            {data.teams.map(t => (
              <div key={t.id} className="item" data-testid="team-row">
                <div className="row"><span className={`tag ${t.ended_at ? '' : 'ok'}`}>{t.ended_at ? 'Ended' : 'Active'}</span>
                  <b className="spacer">{t.leader_name ?? t.leader_email ?? '—'}</b><small className="muted">since {fmtTime(t.created_at)}</small></div>
                <small>{t.members.map(m => `${m.name ?? m.email}${m.left_at ? ' (left)' : ''}`).join(' · ') || <span className="muted">No members</span>}</small>
                {t.ended_at && <small className="muted">Ended {fmtTime(t.ended_at)}{t.end_reason ? ` (${t.end_reason})` : ''}</small>}
              </div>
            ))}
          </div>
        )
      ) : data.workspaces.length === 0 ? <p className="muted">No workspaces.</p> : (
        <div className="tablewrap"><table data-testid="ws-list">
          <thead><tr><th>Workspace</th><th>Owner</th><th>Members</th><th>Listings</th><th>Records</th><th>Made</th></tr></thead>
          <tbody>{data.workspaces.map(w => (
            <tr key={w.id}>
              <td><button className="linkbtn" onClick={() => go({ k: 'workspace', id: w.id })} data-testid="ws-open">{w.name}</button></td>
              <td>{w.owner_name ?? w.owner_email}<br /><small className="muted">{w.owner_email}</small></td>
              <td>{w.members}</td><td>{w.listings}</td><td>{w.records}</td><td className="small">{fmtTime(w.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function WorkspaceScreen({ id }: { id: string }) {
  const { api, go } = useAdmin();
  const [w, setW] = useState<WorkspaceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.workspace(id).then(setW).catch(e => setErr(errText(e))); }, [api, id]);
  if (err) return <ErrorBox text={err} />;
  if (!w) return <Loading />;
  return (
    <div className="stack" data-testid="workspace">
      <h1>{w.name}</h1>
      <Kv rows={[
        { k: 'Owner', v: <button className="linkbtn" onClick={() => go({ k: 'agent', id: w.owner_user })} data-testid="ws-owner">{w.owner_name ?? w.owner_email}</button> },
        { k: 'Made', v: fmtTime(w.created_at) },
        { k: 'Records', v: Object.entries(w.by_kind).map(([k, n]) => `${labelOf(k)} ${n}`).join(' · ') || '—' },
        { k: 'Deleted (kept 7 years)', v: String(w.deleted) },
      ]} />
      <h2>Members</h2>
      <div className="tablewrap"><table data-testid="ws-members">
        <thead><tr><th>Email</th><th>Role</th><th>State</th><th>Joined</th></tr></thead>
        <tbody>{w.members.map(m => (
          <tr key={m.user_id}><td><button className="linkbtn" onClick={() => go({ k: 'agent', id: m.user_id })}>{m.email}</button></td>
            <td>{m.role}</td><td>{m.active ? 'Active' : 'Not active'}</td><td className="small">{fmtTime(m.joined_at)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
