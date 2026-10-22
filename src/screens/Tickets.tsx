// AdminBatch006 Part B — Support Tickets (feature 65): the main app's problem reports, with a status history and internal
// notes that are kept for good (eab_ticket_notes). Owner / Admin change status and write notes; Compliance reads.
// "Email the agent" opens the admin's own email app (nothing is sent by Admin EAB).
import { useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { Ticket, TicketRow, TicketStatus } from '../api/admin';
import { TICKET_NEXT, TICKET_WORD } from '../admin/news';
import { fmtTime } from '../export/reports';
import { platformLabel } from './status';
import { ErrorBox, Loading } from './ui';

type Filter = TicketStatus | 'open' | 'all';
const FILTERS: { k: Filter; label: string }[] = [
  { k: 'open', label: 'Open (new + seen)' }, { k: 'new', label: 'New' }, { k: 'seen', label: 'Seen' }, { k: 'fixed', label: 'Fixed' }, { k: 'closed', label: 'Closed' }, { k: 'all', label: 'All' },
];
const tagFor = (s: TicketStatus) => (s === 'new' ? 'amber' : s === 'seen' ? '' : 'ok');

export function TicketsScreen() {
  const { api, go } = useAdmin();
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ counts: Partial<Record<TicketStatus, number>>; tickets: TicketRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null); setData(null);
    try { setData(await api.tickets(filter === 'all' ? null : filter, query || null)); } catch (e) { setErr(errText(e)); }
  }, [api, filter, query]);
  useEffect(() => { void load(); }, [load]);
  const c = data?.counts ?? {};
  return (
    <div className="stack" data-testid="tickets">
      <h1>Support tickets</h1>
      <p className="muted small" style={{ margin: 0 }}>Problems agents sent from the main app (Profile → Report a problem). Opening this list is recorded.</p>
      <div className="stats">
        {(['new', 'seen', 'fixed', 'closed'] as TicketStatus[]).map(s => (
          <div key={s} className={`stat ${s === 'new' && c.new ? 'amber' : ''}`}><span className="l">{TICKET_WORD[s]}</span><b className="v">{c[s] ?? 0}</b></div>
        ))}
      </div>
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {FILTERS.map(f => <button key={f.k} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)} data-testid={`tfilter-${f.k}`}>{f.label}</button>)}
      </div>
      <form className="row" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input className="spacer" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the text or the agent's email" data-testid="ticket-q" />
        <button className="btn" type="submit">Search</button>
      </form>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : data.tickets.length === 0 ? <p className="muted">No tickets here.</p> : (
        <div className="stack" data-testid="ticket-list">
          {data.tickets.map(t => (
            <button key={t.id} className="item ticket" onClick={() => go({ k: 'ticket', id: t.id })} data-testid="ticket-row">
              <div className="row"><span className={`tag ${tagFor(t.status)}`}>{TICKET_WORD[t.status]}</span>
                <b className="spacer">{t.name ?? t.email ?? 'agent'}</b><small className="muted">{fmtTime(t.created_at)}</small></div>
              <span className="clamp">{t.description}</span>
              <small className="muted">{[t.screen && `screen ${t.screen}`, t.app_version, platformLabel(t.platform), t.has_screenshot && 'screenshot', t.notes ? `${t.notes} note${t.notes === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TicketScreen({ id }: { id: string }) {
  const { api, me, go } = useAdmin();
  const edit = can(me.role, 'editTickets');
  const [t, setT] = useState<Ticket | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [to, setTo] = useState<TicketStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState<string | null>(null);
  useEffect(() => { api.ticket(id).then(setT).catch(e => setErr(errText(e))); }, [api, id]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot); }, [shot]);
  if (err) return <ErrorBox text={err} />;
  if (!t) return <Loading />;
  const run = async (fn: () => Promise<Ticket>) => {
    setBusy(true); setActErr(null);
    try { setT(await fn()); setNote(''); setTo(null); } catch (e) { setActErr(errText(e)); } finally { setBusy(false); }
  };
  const showShot = async () => {
    setShotErr(null);
    try { setShot(URL.createObjectURL(await api.files.screenshot!(t.screenshot_path!))); } catch (e) { setShotErr(errText(e)); }
  };
  const mail = t.email ? `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent('Your problem report — Estate Agent AI Buddy')}&body=${encodeURIComponent(`Hello${t.name ? ` ${t.name}` : ''},\n\nAbout the problem you reported on ${fmtTime(t.created_at)}:\n“${t.description.slice(0, 300)}”\n\n`)}` : null;
  return (
    <div className="stack" data-testid="ticket">
      <div className="row"><h1 className="spacer">Ticket</h1><span className={`tag ${tagFor(t.status)}`} data-testid="ticket-status">{TICKET_WORD[t.status]}</span></div>
      <div className="card stack">
        <div className="row">
          <button className="linkbtn" onClick={() => go({ k: 'agent', id: t.user_id })}>{t.name ?? t.email}</button>
          <small className="muted">{t.email}</small><span className="spacer" />
          {mail && <a className="btn small" href={mail} data-testid="ticket-email">Email the agent</a>}
        </div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }} data-testid="ticket-text">{t.description}</p>
        <small className="muted">{fmtTime(t.created_at)} · {[t.screen && `screen ${t.screen}`, t.app_version && `app ${t.app_version}`, platformLabel(t.platform), t.language].filter(Boolean).join(' · ')}</small>
        {t.screenshot_path && (shot ? <img src={shot} alt="Screenshot sent with the report" className="shot" data-testid="ticket-shot" />
          : <div className="row"><button className="btn small" onClick={() => void showShot()} data-testid="ticket-shot-open">Show screenshot</button>{shotErr && <small className="error">{shotErr}</small>}</div>)}
      </div>
      <h2>History</h2>
      {t.history.length === 0 ? <p className="muted">No notes yet.</p> : (
        <ol className="history" data-testid="ticket-history">
          {t.history.map(n => (
            <li key={n.id}>
              <small className="muted">{fmtTime(n.at)} · {n.by_email}</small><br />
              {n.kind === 'status' ? <><b>{TICKET_WORD[n.from_status!]} → {TICKET_WORD[n.to_status!]}</b>{n.body && <> — {n.body}</>}</> : <span>{n.body}</span>}
            </li>
          ))}
        </ol>
      )}
      {edit ? (
        <div className="card boxed stack" data-testid="ticket-actions">
          <label className="field"><span>Internal note (the agent does not see it; kept for good)</span>
            <textarea rows={3} maxLength={4000} value={note} onChange={e => setNote(e.target.value)} data-testid="ticket-note" /></label>
          <div className="row">
            <span className="muted small">Change status to:</span>
            {TICKET_NEXT[t.status].map(s => <button key={s} className={`btn small ${to === s ? 'gold' : ''}`} aria-pressed={to === s} onClick={() => setTo(to === s ? null : s)} data-testid={`ticket-to-${s}`}>{TICKET_WORD[s]}</button>)}
          </div>
          {actErr && <p className="error small" role="alert">{actErr}</p>}
          <div className="row"><span className="spacer" />
            <button className="btn gold" disabled={busy || !note.trim()} data-testid="ticket-save"
              onClick={() => void run(() => (to ? api.ticketStatus(t.id, to, note.trim()) : api.ticketNote(t.id, note.trim())))}>
              {busy ? 'Saving…' : to ? `Save note and mark ${TICKET_WORD[to]}` : 'Save note'}</button>
          </div>
          <small className="muted">A status change needs a note. Both go into the Master Audit Log with your name and the time.</small>
        </div>
      ) : <p className="notice small">Your role can read tickets but not change them.</p>}
    </div>
  );
}
