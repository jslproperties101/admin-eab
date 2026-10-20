// Small labels shared by the agent list and the Agent Profile.
import { AccountStatus, LicenceDetail } from '../api/admin';

export const STATUS_LABEL: Record<AccountStatus, string> = { active: 'Active', suspended: 'Suspended', banned: 'Banned', closed: 'Closed' };
export const LICENCE_TYPE: Record<string, string> = { REN: 'REN', REA: 'REA', PEA: 'PEA', EA: 'EA', FIRM: 'Firm licence' };
export const EVENT_LABEL: Record<string, string> = {
  sign_in: 'Signed in', app_open: 'Opened the app', sign_in_failed: 'Sign-in failed', locked_out: 'Locked out (30 tries)',
  forced_out: 'Signed out by admin', blocked: 'Blocked (account not active)', sign_out: 'Signed out',
};
const BAD_EVENTS = new Set(['sign_in_failed', 'locked_out', 'blocked', 'forced_out']);
export const isBadEvent = (e: string) => BAD_EVENTS.has(e);
export const platformLabel = (p: string | null | undefined) =>
  ({ android: 'Android', ios: 'iPhone / iPad', web: 'Web browser', desktop: 'Desktop', tablet: 'Tablet', unknown: 'Unknown' } as Record<string, string>)[p ?? ''] ?? (p || '');

export function StatusTag({ status }: { status: AccountStatus }) {
  return <span className={`tag ${status === 'active' ? 'ok' : 'red'}`} data-testid="agent-status">{STATUS_LABEL[status] ?? status}</span>;
}
export function LicenceTag({ licence }: { licence: LicenceDetail | null | undefined }) {
  if (!licence) return <span className="tag">No licence</span>;
  return <span className={`tag ${licence.verified ? 'ok' : 'amber'}`} data-testid="licence-tag">{LICENCE_TYPE[licence.type ?? ''] ?? licence.type ?? 'Licence'} {licence.verified ? '✓ verified' : 'not verified'}</span>;
}
