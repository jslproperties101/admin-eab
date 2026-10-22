// The signed-in frame: top bar (brand, global search, who is signed in, sign out) and the current screen.
import { FormEvent, useState } from 'react';
import { useAdmin } from '../ctx';
import { ROLE_LABEL, can } from '../admin/roles';
import { buildInfo, projectHost } from '../config';
import logo from '../brand/logo-256.webp';
import { Home } from './Home';
import { SearchScreen } from './Search';
import { AgentScreen } from './Agent';
import { LogsScreen } from './Logs';
import { AdminsScreen } from './Admins';
import { AgentsScreen } from './Agents';
import { SettingsScreen } from './Settings';
import { CasesScreen } from './Cases';
import { CaseScreen } from './Case';
import { VaultScreen } from './Vault';
import { HealthScreen } from './Health';
import { DashboardsScreen } from './Dashboards';

export function Shell() {
  const { me, view, go, back, canBack, signOut, conn } = useAdmin();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim().length >= 2) go({ k: 'search', q: q.trim() }); };
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go({ k: 'home' })} aria-label="Admin EAB home">
          <img src={logo} alt="" /><b>Admin EAB</b>
        </button>
        {can(me.role, 'search') && (
          <form className="topsearch" role="search" onSubmit={submit}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search agent, email, phone, listing ref, address" aria-label="Global search" data-testid="global-search" />
            <button className="btn gold" type="submit" disabled={q.trim().length < 2}>Search</button>
          </form>
        )}
        <div className="who">
          <span className="tag gold" data-testid="role">{ROLE_LABEL[me.role]}</span>
          <span className="muted">{me.email}</span>
          <button className="btn small" onClick={() => signOut('manual')} data-testid="sign-out">Sign out</button>
        </div>
      </header>
      <main className="main">
        {view.k !== 'home' && (
          <nav className="crumbs" aria-label="Back">
            {canBack && <button onClick={back}>← Back</button>}
            <button onClick={() => go({ k: 'home' })}>Home</button>
          </nav>
        )}
        {view.k === 'home' && <Home />}
        {view.k === 'search' && <SearchScreen key={view.q ?? ''} initial={view.q} />}
        {view.k === 'agent' && <AgentScreen key={view.id} id={view.id} openCollection={view.collection} openRecord={view.record} />}
        {view.k === 'logs' && <LogsScreen key={view.tab + (view.target ?? '')} tab={view.tab} target={view.target} />}
        {view.k === 'admins' && <AdminsScreen />}
        {view.k === 'agents' && <AgentsScreen key={view.filter} filter={view.filter} />}
        {view.k === 'settings' && <SettingsScreen />}
        {view.k === 'cases' && <CasesScreen />}
        {view.k === 'case' && <CaseScreen key={view.id} id={view.id} />}
        {view.k === 'vault' && <VaultScreen />}
        {view.k === 'health' && <HealthScreen key={view.tab} tab={view.tab} />}
        {view.k === 'dash' && <DashboardsScreen key={view.tab} tab={view.tab} />}
        <footer className="small muted" style={{ marginTop: 32 }}>
          Admin EAB {buildInfo.version} · {buildInfo.sha} · database {projectHost(conn.supabaseUrl)} · signs out after 15 minutes without use
        </footer>
      </main>
    </div>
  );
}
