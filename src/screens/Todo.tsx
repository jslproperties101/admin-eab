// AdminBatch008 — To-Do & Calendar for the admins (feature 13), Joe 22 Oct 2026: each task or event is either private
// (only the person who made it sees it) or shared with the whole admin team (everyone sees it; Owner / Admin /
// Compliance can tick or change it; a Viewer only reads shared items). Every change to a shared item goes to the Master
// Audit Log. Removing an item hides it; nothing is deleted. Times are Malaysia time.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { AdminEvent, AdminTask } from '../api/admin';
import { monthGrid, myDay, myTime, myToday, overdue, sortTasks } from '../admin/comms';
import { fromLocalInput } from '../admin/news';
import { ErrorBox, Loading } from './ui';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function TodoScreen({ tab: first }: { tab: 'todo' | 'calendar' }) {
  const { api, me } = useAdmin();
  const [tab, setTab] = useState(first);
  const [data, setData] = useState<{ tasks: AdminTask[]; events: AdminEvent[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setData(await api.todo()); } catch (e) { setErr(errText(e)); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const viewer = me.role === 'viewer';
  return (
    <div className="stack" data-testid="todo">
      <h1>{tab === 'todo' ? 'To-Do' : 'Calendar'}</h1>
      <div className="tabs" role="group" aria-label="Show">
        <button aria-pressed={tab === 'todo'} onClick={() => setTab('todo')} data-testid="todo-tab-todo">To-Do</button>
        <button aria-pressed={tab === 'calendar'} onClick={() => setTab('calendar')} data-testid="todo-tab-cal">Calendar</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Private items are only for you. Shared items are seen by the whole admin team{viewer ? ' (as a Viewer you can read them, and make private items)' : ' and every change to them is recorded'}.
      </p>
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !data ? <Loading /> : tab === 'todo'
        ? <Tasks tasks={data.tasks} onChanged={load} />
        : <Calendar events={data.events} tasks={data.tasks} onChanged={load} />}
    </div>
  );
}

function SharedPick({ shared, set }: { shared: boolean; set: (v: boolean) => void }) {
  const { me } = useAdmin();
  if (me.role === 'viewer') return null;
  return (
    <div className="row">
      <label className="choice"><input type="radio" checked={!shared} onChange={() => set(false)} data-testid="todo-private" /> Just me</label>
      <label className="choice"><input type="radio" checked={shared} onChange={() => set(true)} data-testid="todo-shared" /> Admin team</label>
    </div>
  );
}
const mayChange = (role: string, item: { mine?: boolean; shared: boolean }) => !!item.mine || (item.shared && role !== 'viewer');

function Tasks({ tasks, onChanged }: { tasks: AdminTask[]; onChanged: () => Promise<void> }) {
  const { api, me } = useAdmin();
  const [title, setTitle] = useState(''); const [due, setDue] = useState(''); const [shared, setShared] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = myToday();
  const list = useMemo(() => sortTasks(tasks), [tasks]);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); await onChanged(); } catch (e) { setErr(errText(e)); } };
  const add = () => run(async () => { await api.taskSave({ title: title.trim(), due_on: due || null, shared }); setTitle(''); setDue(''); });
  return (
    <div className="stack">
      <div className="card boxed stack" data-testid="task-new">
        <div className="row">
          <input className="spacer" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="New task" aria-label="New task" data-testid="task-title"
            onKeyDown={e => { if (e.key === 'Enter' && title.trim()) void add(); }} />
          <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Due on" data-testid="task-due" />
          <button className="btn gold" disabled={!title.trim()} onClick={() => void add()} data-testid="task-add">Add</button>
        </div>
        <SharedPick shared={shared} set={setShared} />
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {list.length === 0 ? <p className="muted">Nothing to do.</p> : (
        <div className="stack" data-testid="task-list">
          {list.map(t => {
            const may = mayChange(me.role, t);
            return (
              <div key={t.id} className={`item task ${t.done ? 'done' : ''}`} data-testid="task-row">
                <div className="row">
                  <label className="choice spacer"><input type="checkbox" checked={t.done} disabled={!may}
                    onChange={e => void run(() => api.taskSave({ id: t.id, done: e.target.checked }))} data-testid="task-done" />
                    <span className="t">{t.title}</span></label>
                  {t.shared && <span className="tag gold">Team</span>}
                  {t.due_on && <span className={`tag ${overdue(t, today) ? 'red' : ''}`}>{overdue(t, today) ? 'Late · ' : ''}{t.due_on}</span>}
                  {may && <button className="btn small" onClick={() => void run(() => api.taskSave({ id: t.id, removed: true }))} data-testid="task-remove">Remove</button>}
                </div>
                {(t.shared && !t.mine) || t.done_by_email ? <small className="muted">{[t.shared && !t.mine && `by ${t.owner_email}`, t.done && t.done_by_email && `done by ${t.done_by_email}`].filter(Boolean).join(' · ')}</small> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Calendar({ events, tasks, onChanged }: { events: AdminEvent[]; tasks: AdminTask[]; onChanged: () => Promise<void> }) {
  const { api, me } = useAdmin();
  const today = myToday();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const byDay = useMemo(() => {
    const m = new Map<string, AdminEvent[]>();
    for (const e of events) { const d = myDay(e.starts_at); m.set(d, [...(m.get(d) ?? []), e]); }
    return m;
  }, [events]);
  const dueByDay = useMemo(() => { const m = new Map<string, number>(); for (const t of tasks) if (t.due_on && !t.done) m.set(t.due_on, (m.get(t.due_on) ?? 0) + 1); return m; }, [tasks]);
  const move = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const dayEvents = (byDay.get(day) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); await onChanged(); } catch (e) { setErr(errText(e)); } };
  return (
    <div className="stack">
      <div className="row"><button className="btn small" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b className="spacer" style={{ textAlign: 'center' }} data-testid="cal-month">{MONTHS[ym.m]} {ym.y}</b>
        <button className="btn small" onClick={() => move(1)} aria-label="Next month">›</button></div>
      <div className="cal" data-testid="cal-grid">
        {DOW.map(d => <span key={d} className="dow">{d}</span>)}
        {grid.map(d => {
          const evs = byDay.get(d) ?? []; const due = dueByDay.get(d) ?? 0;
          return (
            <button key={d} className={`${d.slice(5, 7) !== String(ym.m + 1).padStart(2, '0') ? 'other' : ''} ${d === today ? 'today' : ''}`}
              aria-pressed={d === day} onClick={() => setDay(d)} data-testid={`cal-${d}`} aria-label={`${d}${evs.length ? `, ${evs.length} event${evs.length === 1 ? '' : 's'}` : ''}`}>
              <b>{Number(d.slice(8))}</b>
              {evs.slice(0, 2).map(e => <span key={e.id} className="dot">{e.all_day ? '' : `${myTime(e.starts_at)} `}{e.title}</span>)}
              {evs.length > 2 && <span className="dot">+{evs.length - 2}</span>}
              {due > 0 && <span className="dot">☐ {due}</span>}
            </button>
          );
        })}
      </div>
      <div className="row"><h2 className="spacer">{day}</h2>{!adding && <button className="btn gold" onClick={() => setAdding(true)} data-testid="ev-new">New event</button>}</div>
      {adding && <EventEditor day={day} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await onChanged(); }} />}
      {err && <p className="error" role="alert">{err}</p>}
      {dayEvents.length === 0 ? <p className="muted">Nothing on this day.</p> : (
        <div className="stack" data-testid="ev-list">
          {dayEvents.map(e => (
            <div key={e.id} className="item" data-testid="ev-row">
              <div className="row"><b className="spacer">{e.all_day ? 'All day' : `${myTime(e.starts_at)}${e.ends_at ? `–${myTime(e.ends_at)}` : ''}`} · {e.title}</b>
                {e.shared && <span className="tag gold">Team</span>}
                {mayChange(me.role, e) && <button className="btn small" onClick={() => void run(() => api.eventSave({ id: e.id, removed: true }))} data-testid="ev-remove">Remove</button>}</div>
              {(e.place || e.notes) && <small>{[e.place, e.notes].filter(Boolean).join(' · ')}</small>}
              {e.shared && !e.mine && <small className="muted">by {e.owner_email}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventEditor({ day, onClose, onSaved }: { day: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { api } = useAdmin();
  const [title, setTitle] = useState(''); const [place, setPlace] = useState(''); const [notes, setNotes] = useState('');
  const [allDay, setAllDay] = useState(false); const [start, setStart] = useState(`${day}T09:00`); const [end, setEnd] = useState(`${day}T10:00`);
  const [shared, setShared] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const bad = !title.trim() ? 'A title is needed.' : !allDay && end && end < start ? 'The end is before the start.' : null;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.eventSave({ title: title.trim(), place: place.trim() || null, notes: notes.trim() || null, all_day: allDay, shared,
        starts_at: allDay ? fromLocalInput(`${day}T00:00`)! : fromLocalInput(start)!, ends_at: allDay ? null : (end ? fromLocalInput(end) : null) });
      await onSaved();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="ev-editor">
      <label className="field"><span>Title</span><input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} data-testid="ev-title" /></label>
      <label className="choice"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} data-testid="ev-allday" /> All day</label>
      {!allDay && <div className="row">
        <label className="field"><span>Starts (Malaysia time)</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} data-testid="ev-start" /></label>
        <label className="field"><span>Ends</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} data-testid="ev-end" /></label>
      </div>}
      <label className="field"><span>Place (optional)</span><input value={place} maxLength={200} onChange={e => setPlace(e.target.value)} /></label>
      <label className="field"><span>Notes (optional)</span><textarea rows={2} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} /></label>
      <SharedPick shared={shared} set={setShared} />
      {bad && <small className="muted">{bad}</small>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row"><button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
        <button className="btn gold" disabled={!!bad || busy} onClick={() => void save()} data-testid="ev-save">{busy ? 'Saving…' : 'Save'}</button></div>
    </div>
  );
}
