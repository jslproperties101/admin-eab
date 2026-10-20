// Global search (feature 77): agents by name / email / user ID, and records by listing reference, address, contact
// name or phone. Every search is written to the access log by the database.
import { FormEvent, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { SearchHit } from '../api/admin';
import { labelOf } from '../export/reports';
import { ErrorBox, Loading } from './ui';

export function SearchScreen({ initial }: { initial?: string }) {
  const { api, go } = useAdmin();
  const [q, setQ] = useState(initial ?? '');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (text: string) => {
    if (text.trim().length < 2) return;
    setBusy(true); setErr(null);
    try { setHits(await api.search(text.trim())); } catch (e) { setErr(errText(e)); setHits(null); } finally { setBusy(false); }
  };
  useEffect(() => { if (initial) void run(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => { e.preventDefault(); void run(q); };

  const agents = hits?.filter(h => h.kind === 'agent') ?? [];
  const records = hits?.filter(h => h.kind === 'record') ?? [];
  return (
    <div className="stack">
      <h1>Agent Profile Viewer</h1>
      <p className="muted" style={{ margin: 0 }}>Find an agent by name, email or user ID, or find a record by listing reference, address, contact name or phone.</p>
      <form className="row" onSubmit={submit}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="At least 2 characters" style={{ flex: 1, minWidth: 200 }} aria-label="Search" data-testid="search-input" />
        <button className="btn gold" type="submit" disabled={busy || q.trim().length < 2}>Search</button>
      </form>
      {busy && <Loading text="Searching…" />}
      {err && <ErrorBox text={err} onRetry={() => void run(q)} />}
      {hits && !busy && hits.length === 0 && <p className="muted" data-testid="no-results">Nothing found for “{q}”.</p>}
      {agents.length > 0 && (
        <section className="stack">
          <h2>Agents ({agents.length})</h2>
          <div className="list">
            {agents.map(a => (
              <button key={a.user_id} className="item" onClick={() => go({ k: 'agent', id: a.user_id })} data-testid="hit-agent">
                <b>{a.name || a.email}</b><br /><small className="muted">{a.email} · {a.user_id}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {records.length > 0 && (
        <section className="stack">
          <h2>Records ({records.length})</h2>
          <div className="list">
            {records.map(r => (
              <button key={`${r.workspace_id}/${r.collection}/${r.record_id}`} className={`item ${r.deleted ? 'deleted' : ''}`}
                onClick={() => go({ k: 'agent', id: r.user_id, collection: r.collection, record: r.record_id })} data-testid="hit-record">
                <span className="row"><b>{r.label}</b><span className="tag">{labelOf(r.collection ?? '')}</span>{r.deleted && <span className="tag red">Deleted</span>}</span>
                {r.sub && <small className="muted">{r.sub}</small>}<br /><small className="muted">Agent: {r.email}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
