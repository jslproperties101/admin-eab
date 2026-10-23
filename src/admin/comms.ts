// AdminBatch008 — pure helpers for the broadcast, report, workspace and to-do screens (tested in tests/comms.test.ts).
import type { Broadcast, BcRecipientStatus, BcStatus, ReportRun } from '../api/admin';

export type Lang = 'en' | 'bm' | 'zh';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', bm: 'Bahasa Melayu', zh: '中文' };

/** The agent's language, or English when that version was left empty (same rule as the server function). */
export function textFor(b: Pick<Broadcast, 'subject_en' | 'subject_bm' | 'subject_zh' | 'body_en' | 'body_bm' | 'body_zh'>, lang: Lang) {
  const pick = (en?: string | null, bm?: string | null, zh?: string | null) => ((lang === 'bm' ? bm : lang === 'zh' ? zh : en) || en || '').trim();
  return { subject: pick(b.subject_en, b.subject_bm, b.subject_zh), body: pick(b.body_en, b.body_bm, b.body_zh) };
}

/** Tap-to-send: WhatsApp opens with the message typed in; the admin presses Send. Number = digits with country code. */
export const waLink = (number: string, text: string) => `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
/** +60 12-345 6789 for showing a WhatsApp number (digits from the database). */
export function showPhone(digits: string | null | undefined): string {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  return d.startsWith('60') && d.length >= 10 ? `+60 ${d.slice(2, 4)}-${d.slice(4, d.length - 4)} ${d.slice(-4)}` : `+${d}`;
}

export const BC_STATUS: Record<BcStatus, string> = { draft: 'Draft', queued: 'Ready to send', sending: 'Sending', done: 'Done', cancelled: 'Cancelled' };
export const RCP_STATUS: Record<BcRecipientStatus, string> = {
  pending: 'Waiting', sent: 'Sent', failed: 'Failed', opened_wa: 'Opened in WhatsApp', cancelled: 'Cancelled',
  skipped_no_consent: 'Skipped: said no to news & offers', skipped_no_address: 'Skipped: no email / phone', skipped_not_active: 'Skipped: account not active',
};

/** One line for the list: "12 sent · 1 failed · 3 skipped · 4 waiting". */
export function countsLine(c: Broadcast['counts']): string {
  const skipped = (c.skipped_no_consent ?? 0) + (c.skipped_no_address ?? 0) + (c.skipped_not_active ?? 0);
  const parts: string[] = [];
  if (c.sent) parts.push(`${c.sent} sent`);
  if (c.opened_wa) parts.push(`${c.opened_wa} opened in WhatsApp`);
  if (c.failed) parts.push(`${c.failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (c.pending) parts.push(`${c.pending} waiting`);
  if (c.cancelled) parts.push(`${c.cancelled} not sent (cancelled)`);
  return parts.join(' · ') || 'Nobody yet';
}

/** A draft is ready to queue when the English text (and, for email, the English subject) is there and an audience is chosen. */
export function draftProblem(d: { channel: 'email' | 'whatsapp'; subject_en?: string | null; body_en: string; audience: 'all' | 'groups' | 'agents'; group_ids: string[]; user_ids?: string[] }): string | null {
  if (!d.body_en.trim()) return 'Write the English text (the other languages are optional).';
  if (d.channel === 'email' && !(d.subject_en ?? '').trim()) return 'Write the English subject.';
  if (d.audience === 'groups' && d.group_ids.length === 0) return 'Choose at least one group, or everyone.';
  // AdminBatch009: "Message" from the Agents list = exactly the ticked agents
  if (d.audience === 'agents' && !(d.user_ids?.length)) return 'No agents chosen. Tick agents in the Agents list, then Message.';
  return null;
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const REPORT_STATUS: Record<ReportRun['status'], string> = { making: 'Being made', stored: 'Kept in the vault', emailed: 'Kept and emailed', failed: 'Failed' };

/** Calendar: the 6 x 7 days shown for a month (Monday first), as YYYY-MM-DD strings. */
export function monthGrid(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const shift = (first.getUTCDay() + 6) % 7;   // Monday = 0
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(year, month0, 1 - shift + i)).toISOString().slice(0, 10));
}
/** The Malaysia-time day (YYYY-MM-DD) of a moment. */
export const myDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
/** 'HH:MM' Malaysia time of a moment. */
export const myTime = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(11, 16);
/** Today in Malaysia time. */
export const myToday = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

/** Tasks for the list: not done first, then by due date (no date last), then newest. Overdue = not done and due before today. */
export function sortTasks<T extends { done: boolean; due_on: string | null; created_at: string }>(ts: T[]): T[] {
  return [...ts].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || b.created_at.localeCompare(a.created_at));
}
export const overdue = (t: { done: boolean; due_on: string | null }, today: string) => !t.done && !!t.due_on && t.due_on < today;
