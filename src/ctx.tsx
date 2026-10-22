// Shared state for the signed-in part of the app: connection, session, who the admin is, navigation and the API.
import { createContext, useContext } from 'react';
import { Conn } from './config';
import { Api, Me } from './api/admin';

export type View =
  | { k: 'home' }
  | { k: 'search'; q?: string }
  | { k: 'agent'; id: string; collection?: string; record?: string }
  | { k: 'logs'; tab: 'actions' | 'access'; target?: string }
  | { k: 'admins' }
  | { k: 'agents'; filter: 'all' | 'not_active' | 'licence' | 'security' }
  | { k: 'settings' }
  | { k: 'cases' }
  | { k: 'case'; id: string }
  | { k: 'vault' }
  | { k: 'health'; tab: HealthTab }
  | { k: 'dash'; tab: DashTab }
  | { k: 'news'; tab: NewsTab }
  | { k: 'tickets' }
  | { k: 'ticket'; id: string }
  | { k: 'ops'; tab: OpsTab }
  | { k: 'master' }
  | { k: 'top' }
  | { k: 'live' }
  | { k: 'pdpa' }
  | { k: 'pdpa_req'; id: string }
  | { k: 'complaints' }
  | { k: 'complaint'; id: string }
  | { k: 'holds' }
  | { k: 'licences' }
  | { k: 'retention' }
  | { k: 'reports'; tab: ReportsTab };

/** AdminBatch008 */
export type ReportsTab = 'board' | 'audit' | 'builder';
/** AdminBatch006 */
export type NewsTab = 'news' | 'project' | 'announcement' | 'groups' | 'codes' | 'push';
export type OpsTab = 'maintenance' | 'release' | 'flags';
/** AdminBatch005 dashboard tabs. */
export type DashTab = 'growth' | 'active' | 'retention' | 'inactive' | 'versions' | 'listings' | 'pipeline' | 'usage';
export type HealthTab = 'db' | 'storage' | 'backups' | 'sync' | 'push' | 'performance' | 'errors';

export interface AdminCtx {
  conn: Conn;
  me: Me;
  api: Api;
  view: View;
  go: (v: View) => void;
  back: () => void;
  canBack: boolean;
  signOut: (why?: 'idle' | 'manual' | 'expired') => void;
}
export const Ctx = createContext<AdminCtx | null>(null);
export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin outside the signed-in app');
  return c;
}

/** Plain-words message for an error from the API. */
export function errText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = (e as Error)?.message ?? '';
  switch (code) {
    case 'not-allowed': return 'Your admin role does not allow this.';
    case 'not-found': return msg && msg !== 'not-found' ? cap(msg) + '.' : 'Not found.';
    case 'network': return 'No connection. Check the internet and try again.';
    case 'expired': return 'Your sign-in has expired. Please sign in again.';
    case 'not-configured': return 'The database connection is not set up.';
    default: return msg ? `Something went wrong: ${msg}` : 'Something went wrong.';
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
