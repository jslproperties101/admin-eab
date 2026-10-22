// Home: every feature as an icon tile, grouped in sections. Built features open; the rest say "Coming soon".
import { useState } from 'react';
import { useAdmin } from '../ctx';
import { can, ROLE_HELP } from '../admin/roles';
import { SECTIONS } from './features';

export function Home() {
  const { me, go } = useAdmin();
  // AdminBatch008: To-Do & Calendar asks which one first, like the main app's Agenda card.
  const [ask, setAsk] = useState(false);
  if (me.role === 'regulator') return <RegulatorHome />;
  const ready = SECTIONS.flatMap(s => s.items).filter(f => f.open && (!f.needs || can(me.role, f.needs))).length;
  return (
    <div>
      <div className="card boxed stack" style={{ marginBottom: 18 }}>
        <h1>Welcome</h1>
        <p className="muted" style={{ margin: 0 }}>{ROLE_HELP[me.role]} {ready} feature{ready === 1 ? '' : 's'} available to you now.</p>
        {me.expires_at && <p className="notice warn" style={{ margin: 0 }}>Your access ends {new Date(me.expires_at).toLocaleString()}.</p>}
      </div>
      {SECTIONS.map(s => (
        <section className="section" key={s.title} aria-label={s.title}>
          <h2>{s.title}</h2>
          <div className="tiles">
            {s.items.map(f => {
              const allowed = !f.needs || can(me.role, f.needs);
              const isReady = !!f.open && allowed;
              const status = f.blocked ? f.blocked : f.open && !allowed ? 'Not for your role' : f.open ? f.note ?? 'Open' : 'Coming soon';
              return (
                <button key={`${s.title}-${f.n}`} className={`tile ${isReady ? 'ready' : 'soon'}`} disabled={!isReady}
                  onClick={() => { if (f.choose) setAsk(true); else if (f.open) go(f.open); }} data-testid={isReady ? `tile-${f.n}` : undefined}>
                  <span className="ico" aria-hidden="true">{String(f.n)}</span>
                  <span className="t">{f.name}</span>
                  <span className="n">{status}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {ask && (
        <div className="overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) setAsk(false); }}>
          <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Open which?" data-testid="agenda-ask">
            <h2>Open which?</h2>
            <button className="btn gold" onClick={() => { setAsk(false); go({ k: 'todo', tab: 'calendar' }); }} data-testid="agenda-calendar">Calendar</button>
            <button className="btn gold" onClick={() => { setAsk(false); go({ k: 'todo', tab: 'todo' }); }} data-testid="agenda-todo">To-Do</button>
            <button className="btn" onClick={() => setAsk(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A regulator officer with temporary access sees only their case(s) and the vault entries for them. */
function RegulatorHome() {
  const { me, go } = useAdmin();
  return (
    <div className="stack">
      <div className="card boxed stack">
        <h1>Welcome</h1>
        <p className="muted" style={{ margin: 0 }}>{ROLE_HELP.regulator}</p>
        {me.expires_at && <p className="notice warn" style={{ margin: 0 }}>Your access ends {new Date(me.expires_at).toLocaleString()}.</p>}
        <p className="small muted" style={{ margin: 0 }}>Everything you open is recorded.</p>
      </div>
      <div className="tiles">
        <button className="tile ready" onClick={() => go({ k: 'cases' })} data-testid="tile-my-case"><span className="ico">72</span><span className="t">My case</span><span className="n">Agents and packs prepared for you</span></button>
        <button className="tile ready" onClick={() => go({ k: 'vault' })} data-testid="tile-my-vault"><span className="ico">19</span><span className="t">Packs & check a file</span><span className="n">Download, or prove a copy is genuine</span></button>
      </div>
    </div>
  );
}
