// Home: every feature as an icon tile, grouped in sections. Built features open; the rest say "Coming soon".
import { useAdmin } from '../ctx';
import { can, ROLE_HELP } from '../admin/roles';
import { SECTIONS } from './features';

export function Home() {
  const { me, go } = useAdmin();
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
                  onClick={() => f.open && go(f.open)} data-testid={isReady ? `tile-${f.n}` : undefined}>
                  <span className="ico" aria-hidden="true">{String(f.n)}</span>
                  <span className="t">{f.name}</span>
                  <span className="n">{status}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
