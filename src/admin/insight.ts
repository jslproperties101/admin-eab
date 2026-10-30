// AdminBatch009 — plain functions behind the Agent insight screens (unit-tested, no browser).
import { AgentDevice, BulkAction, DuplicateGroup, Funnel, FunnelKey } from '../api/admin';
import { TAG_RE, cleanTag } from './compliance';

/** Score colour: red under 40, amber under 70, green from 70. */
export const scoreLevel = (s: number): 'red' | 'amber' | 'ok' => (s < 40 ? 'red' : s < 70 ? 'amber' : 'ok');
export const SCORE_PARTS = [
  { key: 'p_listings', label: 'Listings', max: 40, help: 'How complete the listings are (9 main details each)' },
  { key: 'p_activity', label: 'Activity', max: 30, help: 'Days the app was used in the last 30 days (20+ = full)' },
  { key: 'p_compliance', label: 'Compliance', max: 30, help: 'Licence verified 15, expiry date not passed 5, no open complaint 5, no legal hold 5' },
] as const;

export const FUNNEL_LABEL: Record<FunnelKey, string> = {
  signed_up: 'Signed up', opened: 'Opened the app', terms: 'Accepted the Terms', licence: 'Entered a licence',
  verified: 'Licence verified', listing: 'First listing', deal: 'First deal (Sold / Rented or a confirmed deal)',
};
/** Each step with its share of everyone who signed up and of the step before. */
export function funnelRows(f: Funnel): { step: number; key: FunnelKey; label: string; agents: number; ofAll: number | null; ofPrev: number | null; lost: number }[] {
  const first = f.steps[0]?.agents ?? 0;
  return f.steps.map((s, i) => {
    const prev = i === 0 ? null : f.steps[i - 1].agents;
    return {
      step: s.step, key: s.key, label: FUNNEL_LABEL[s.key] ?? s.key, agents: s.agents,
      ofAll: first > 0 ? Math.round((s.agents / first) * 100) : null,
      ofPrev: prev === null ? null : prev > 0 ? Math.round((s.agents / prev) * 100) : null,
      lost: prev === null ? 0 : Math.max(prev - s.agents, 0),
    };
  });
}

export const BULK_MAX = 50;
export const BULK_LABEL: Record<BulkAction | 'message', string> = {
  suspend: 'Suspend (they are signed out and cannot use the app)', reactivate: 'Re-activate', sign_out: 'Sign out on all their phones',
  tag_add: 'Add a tag', tag_remove: 'Remove a tag', message: 'Message them (email or WhatsApp broadcast)',
};
export function bulkProblems(action: BulkAction | 'message' | '', count: number, reason: string, tag: string): string[] {
  const out: string[] = [];
  if (!action) out.push('Choose what to do.');
  if (count === 0) out.push('Tick at least one agent.');
  if (count > BULK_MAX) out.push(`At most ${BULK_MAX} agents at a time.`);
  if (action && action !== 'message' && reason.trim().length < 5) out.push('Write the reason (at least 5 characters). It goes into the Master Audit Log.');
  if ((action === 'tag_add' || action === 'tag_remove') && !TAG_RE.test(cleanTag(tag))) out.push('A tag is 1-30 small letters, digits, space, dash or underscore.');
  return out;
}

export const DUP_LABEL: Record<DuplicateGroup['kind'], string> = { phone: 'Same phone number', device: 'Same phone (device)', licence: 'Same licence number' };

/** Plain words for a device's state: removed (and whether it signed in again since), or in use. */
export function deviceState(d: Pick<AgentDevice, 'removed' | 'signed_in_after_removal'>): { text: string; level: 'red' | 'amber' | '' } {
  if (!d.removed) return { text: 'In use', level: '' };
  return d.signed_in_after_removal
    ? { text: 'Removed, but signed in again afterwards', level: 'amber' }
    : { text: 'Removed — signed out at its next open or sync', level: 'red' };
}
