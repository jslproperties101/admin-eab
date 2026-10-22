// AdminBatch007 — plain functions behind the compliance screens (unit-tested, no browser):
// labels in plain words, the PDPA answer deadline, licence-expiry levels, and form checks.
import { ComplaintCategory, ComplaintChannel, ComplaintStatus, NewComplaint, NewPdpa, PdpaKind, PdpaStatus } from '../api/admin';
import { addDays, daysSince } from './health';

export const PDPA_KIND: Record<PdpaKind, string> = {
  access: 'Copy of my data (access)', correction: 'Correct my data', deletion: 'Delete my data', withdraw_consent: 'Withdraw consent', other: 'Other',
};
export const PDPA_STATUS: Record<PdpaStatus, string> = { open: 'Open', in_progress: 'In progress', done: 'Done', refused: 'Refused' };
export const COMPLAINT_STATUS: Record<ComplaintStatus, string> = {
  open: 'Open', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed', referred: 'Referred (Board / police)',
};
export const COMPLAINT_CHANNEL: Record<ComplaintChannel, string> = { phone: 'Phone', email: 'Email', walk_in: 'Walk-in', board: 'From the Board', other: 'Other' };
export const COMPLAINT_CATEGORY: Record<ComplaintCategory, string> = {
  misleading_listing: 'Misleading listing / advert', conduct: 'Agent conduct', fees: 'Fees / commission', privacy: 'Privacy', other: 'Other',
};

/** PDPA: an access or correction request must be answered within 21 days of receiving it. */
export const PDPA_DAYS = 21;
export const hasDeadline = (k: PdpaKind) => k === 'access' || k === 'correction';
export function pdpaDeadline(r: { kind: PdpaKind; received_on: string; status: PdpaStatus }, today: string):
  { due: string; daysLeft: number; level: 'ok' | 'amber' | 'red' } | null {
  if (!hasDeadline(r.kind) || r.status === 'done' || r.status === 'refused') return null;
  const due = addDays(r.received_on, PDPA_DAYS);
  const daysLeft = -(daysSince(due, today) ?? 0);
  return { due, daysLeft, level: daysLeft < 0 ? 'red' : daysLeft <= 7 ? 'amber' : 'ok' };
}
export function deadlineText(d: ReturnType<typeof pdpaDeadline>): string {
  if (!d) return '';
  return d.daysLeft < 0 ? `${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} late (due ${d.due})` : d.daysLeft === 0 ? `due today (${d.due})` : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left (due ${d.due})`;
}

/** Licence expiry level: expired, red (≤ 7 days), amber (≤ 30), ok, or none (no date yet). */
export function expiryLevel(daysLeft: number | null): 'expired' | 'red' | 'amber' | 'ok' | 'none' {
  if (daysLeft === null) return 'none';
  return daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'red' : daysLeft <= 30 ? 'amber' : 'ok';
}
export function expiryText(daysLeft: number | null, on: string | null): string {
  if (daysLeft === null || !on) return 'No expiry date';
  return daysLeft < 0 ? `Expired ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago (${on})` : daysLeft === 0 ? `Expires today (${on})` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${on})`;
}

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
export function pdpaProblems(p: NewPdpa, today: string): string[] {
  const out: string[] = [];
  if (!p.requester_name.trim()) out.push('Who asked? Type the name.');
  if (!isDay(p.received_on)) out.push('Pick the date the request was received.');
  else if (p.received_on > today) out.push('The date received cannot be in the future.');
  if (!p.details.trim()) out.push('Write what was asked.');
  if (p.details.length > 4000) out.push('At most 4,000 letters.');
  return out;
}
export function complaintProblems(c: NewComplaint, today: string): string[] {
  const out: string[] = [];
  if (!c.complainant_name.trim()) out.push('Who complained? Type the name.');
  if (!isDay(c.received_on)) out.push('Pick the date the complaint was received.');
  else if (c.received_on > today) out.push('The date received cannot be in the future.');
  if (!c.details.trim()) out.push('Write what the complaint is about.');
  if (c.details.length > 4000) out.push('At most 4,000 letters.');
  return out;
}
export const TAG_RE = /^[a-z0-9][a-z0-9 _-]{0,29}$/;
export const cleanTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
