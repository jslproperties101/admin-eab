// AdminBatch006 — plain functions behind News & Announcements, Support and Operations (unit-tested, no browser):
//   * checking a post before saving (title, links, banner / pop-up, audience)
//   * the file name for an uploaded picture or PDF
//   * re-ordering: drag and drop, and "type a position number"
//   * audience-group filters from the form and back, and in plain words
//   * minimum version, maintenance, ticket and flag wording
import { AudienceGroup, FeedDraft, FeedKind, GroupFilters, TicketStatus } from '../api/admin';

export const KIND_TITLE: Record<FeedKind, string> = { news: 'Market News', project: 'Projects', announcement: 'Announcements' };
export const KIND_ONE: Record<FeedKind, string> = { news: 'news post', project: 'project', announcement: 'announcement' };
export const STATUS_WORD: Record<string, string> = { draft: 'Draft', published: 'Published', withdrawn: 'Withdrawn' };
export const AUDIENCE_WORD: Record<string, string> = { all: 'Everyone', groups: 'Chosen groups', codes: 'Invitation code only' };

const HTTPS = /^https:\/\/[^\s]{3,}$/;
export const isHttps = (u: string | null | undefined) => !u || HTTPS.test(u.trim());

/** Problems that stop a post from being saved, in plain words (empty = fine). */
export function draftProblems(d: FeedDraft, now = new Date()): string[] {
  const p: string[] = [];
  if (!d.title_en?.trim()) p.push('The English title is needed (BM and Chinese are optional; English is shown when they are empty).');
  for (const k of ['title_en', 'title_bm', 'title_zh'] as const) if ((d[k] ?? '').length > 200) p.push('Titles can be at most 200 letters.');
  for (const k of ['body_en', 'body_bm', 'body_zh'] as const) if ((d[k] ?? '').length > 10000) p.push('The text can be at most 10,000 letters.');
  if (!isHttps(d.image_url)) p.push('The picture link must start with https://');
  if (!isHttps(d.link_url)) p.push('The website link must start with https://');
  if (!isHttps(d.pdf_url)) p.push('The PDF link must start with https://');
  if (d.kind === 'announcement' && !d.display) p.push('Choose banner or pop-up.');
  if (d.audience === 'groups' && !(d.group_ids?.length)) p.push('Choose at least one audience group.');
  if (d.audience === 'codes' && d.kind !== 'project') p.push('Invitation codes are for Projects only.');
  if (d.expires_at && new Date(d.expires_at).getTime() <= now.getTime()) p.push('The end date is already past.');
  return [...new Set(p)];
}

// ---------- uploads ----------
export const MEDIA_MAX = 10 * 1024 * 1024;
const EXT: Record<string, 'jpg' | 'png' | 'webp' | 'pdf'> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
/** File name in the public folder: <year>/<random id>.<ext>. Returns an error text instead when the file is not allowed. */
export function mediaPath(file: { type: string; size: number }, want: 'image' | 'pdf', id: string, now = new Date()): { path: string } | { error: string } {
  const ext = EXT[file.type];
  if (!ext || (want === 'pdf') !== (ext === 'pdf')) return { error: want === 'pdf' ? 'Choose a PDF file.' : 'Choose a JPG, PNG or WEBP picture.' };
  if (file.size > MEDIA_MAX) return { error: 'The file is larger than 10 MB.' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return { error: 'Could not name the file.' };
  return { path: `${now.getUTCFullYear()}/${id}.${ext}` };
}

// ---------- order (Change G): drag and drop, or type a number ----------
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list.slice();
  const t = Math.max(0, Math.min(list.length - 1, to));
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(t, 0, x);
  return out;
}
/** "Type a position": 1 = first; numbers past the end put it last. Returns null for anything that is not a whole number ≥ 1. */
export function placeAt<T>(list: T[], from: number, typed: string): T[] | null {
  const n = Number(typed.trim());
  if (!Number.isInteger(n) || n < 1) return null;
  return moveTo(list, from, n - 1);
}
/** The order to show in the editor: the saved order first, then items without a position (newest first). */
export function mergeOrder(saved: { item_id: string; position: number }[], items: { id: string; created_at: string }[]): string[] {
  const known = new Set(items.map(i => i.id));
  const first = [...saved].sort((a, b) => a.position - b.position).map(s => s.item_id).filter(id => known.has(id));
  const rest = items.filter(i => !first.includes(i.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(i => i.id);
  return [...first, ...rest];
}

// ---------- audience groups ----------
export interface FilterForm {
  emails: string; countries: string; licence_types: string[]; languages: string[]; platforms: string[]; app_versions: string;
  joined_from: string; joined_to: string; last_login_from: string; last_login_to: string; min_logins: string;
}
export const EMPTY_FILTER_FORM: FilterForm = { emails: '', countries: '', licence_types: [], languages: [], platforms: [], app_versions: '',
  joined_from: '', joined_to: '', last_login_from: '', last_login_to: '', min_logins: '' };
const list = (s: string) => [...new Set(s.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
const startKL = (d: string) => `${d}T00:00:00+08:00`;
const endKL = (d: string) => `${d}T23:59:59+08:00`;

export function formToFilters(f: FilterForm): GroupFilters {
  const out: GroupFilters = {};
  const emails = list(f.emails).map(e => e.toLowerCase());
  if (emails.length) out.emails = emails;
  const countries = [...new Set(f.countries.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean))];
  if (countries.length) out.countries = countries;
  if (f.licence_types.length) out.licence_types = f.licence_types;
  if (f.languages.length) out.languages = f.languages;
  if (f.platforms.length) out.platforms = f.platforms;
  const versions = list(f.app_versions);
  if (versions.length) out.app_versions = versions;
  if (f.joined_from) out.joined_from = startKL(f.joined_from);
  if (f.joined_to) out.joined_to = endKL(f.joined_to);
  if (f.last_login_from) out.last_login_from = startKL(f.last_login_from);
  if (f.last_login_to) out.last_login_to = endKL(f.last_login_to);
  const n = Number(f.min_logins);
  if (f.min_logins.trim() && Number.isInteger(n) && n > 0) out.min_logins = n;
  return out;
}
export function filtersToForm(g: GroupFilters | null | undefined): FilterForm {
  const day = (s?: string) => (s ? s.slice(0, 10) : '');
  return {
    emails: (g?.emails ?? []).join(', '), countries: (g?.countries ?? []).join(', '), licence_types: g?.licence_types ?? [],
    languages: g?.languages ?? [], platforms: g?.platforms ?? [], app_versions: (g?.app_versions ?? []).join(', '),
    joined_from: day(g?.joined_from), joined_to: day(g?.joined_to), last_login_from: day(g?.last_login_from), last_login_to: day(g?.last_login_to),
    min_logins: g?.min_logins ? String(g.min_logins) : '',
  };
}
export function filterProblems(f: FilterForm): string[] {
  const p: string[] = [];
  const bad = list(f.emails).filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) p.push(`Not an email address: ${bad.slice(0, 3).join(', ')}`);
  if (list(f.app_versions).some(v => !/^[0-9]+(\.[0-9]+){0,3}$/.test(v))) p.push('App versions look like 2.2.0');
  if (f.joined_from && f.joined_to && f.joined_from > f.joined_to) p.push('"Joined from" is after "joined to".');
  if (f.last_login_from && f.last_login_to && f.last_login_from > f.last_login_to) p.push('"Last sign-in from" is after "last sign-in to".');
  if (f.min_logins.trim() && !(Number.isInteger(Number(f.min_logins)) && Number(f.min_logins) > 0)) p.push('Number of sign-ins must be a whole number.');
  return p;
}
export const LANGS: { v: string; label: string }[] = [{ v: 'en', label: 'English' }, { v: 'bm', label: 'Bahasa Melayu' }, { v: 'zh', label: 'Chinese' }];
export const LICENCES: { v: string; label: string }[] = [{ v: 'REN', label: 'REN' }, { v: 'REA', label: 'REA' }, { v: 'PEA', label: 'PEA' }, { v: 'EA', label: 'EA' }, { v: 'FIRM', label: 'Firm / agency' }];
export const PLATFORMS: { v: string; label: string }[] = [{ v: 'android', label: 'Android' }, { v: 'ios', label: 'iPhone / iPad' }, { v: 'web', label: 'Web browser' }];

/** One line describing a group's filters, e.g. "Language: Bahasa Melayu · Joined from 2026-10-01". */
export function describeFilters(g: GroupFilters | null | undefined): string {
  if (!g || !Object.keys(g).length) return 'Every agent';
  const label = (opts: { v: string; label: string }[], v: string) => opts.find(o => o.v === v)?.label ?? v;
  const parts: string[] = [];
  if (g.emails?.length) parts.push(`${g.emails.length} email${g.emails.length === 1 ? '' : 's'}`);
  if (g.user_ids?.length) parts.push(`${g.user_ids.length} chosen agent${g.user_ids.length === 1 ? '' : 's'}`);
  if (g.countries?.length) parts.push(`Country: ${g.countries.join(', ')}`);
  if (g.licence_types?.length) parts.push(`Licence: ${g.licence_types.map(v => label(LICENCES, v)).join(', ')}`);
  if (g.languages?.length) parts.push(`Language: ${g.languages.map(v => label(LANGS, v)).join(', ')}`);
  if (g.platforms?.length) parts.push(`Platform: ${g.platforms.map(v => label(PLATFORMS, v)).join(', ')}`);
  if (g.app_versions?.length) parts.push(`Version: ${g.app_versions.join(', ')}`);
  if (g.joined_from || g.joined_to) parts.push(`Joined ${g.joined_from ? `from ${g.joined_from.slice(0, 10)}` : ''}${g.joined_from && g.joined_to ? ' ' : ''}${g.joined_to ? `to ${g.joined_to.slice(0, 10)}` : ''}`);
  if (g.last_login_from || g.last_login_to) parts.push(`Last sign-in ${g.last_login_from ? `from ${g.last_login_from.slice(0, 10)}` : ''}${g.last_login_from && g.last_login_to ? ' ' : ''}${g.last_login_to ? `to ${g.last_login_to.slice(0, 10)}` : ''}`);
  if (g.min_logins) parts.push(`At least ${g.min_logins} sign-ins`);
  return parts.join(' · ');
}
/** Groups by rank (1 = highest; Everyone is always last). */
export const sortGroups = (gs: AudienceGroup[]) => [...gs].sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));

// ---------- operations ----------
export const VERSION_RE = /^[0-9]+(\.[0-9]+){0,3}$/;
export const TICKET_WORD: Record<TicketStatus, string> = { new: 'New', seen: 'Seen', fixed: 'Fixed', closed: 'Closed' };
export const TICKET_NEXT: Record<TicketStatus, TicketStatus[]> = { new: ['seen', 'fixed', 'closed'], seen: ['fixed', 'closed', 'new'], fixed: ['closed', 'seen'], closed: ['seen'] };
/** Flag key from its name: "House Shopping v2" → "house_shopping_v2". */
export function flagKey(label: string): string {
  const k = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return /^[a-z0-9]/.test(k) && k.length >= 2 ? k : '';
}
export const FLAG_KEY_RE = /^[a-z0-9][a-z0-9_.-]{1,59}$/;
/** datetime-local value (Malaysia time) <-> ISO */
export const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 16) : '');
export const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);
/** "at least" wording for delivered pushes (Android does not report every delivery). */
export function pushLine(r: { targeted: number | null; sent: number | null; failed: number | null; no_phone: number | null; delivered: number; opened: number }): string {
  const n = (x: number | null) => (x ?? 0).toLocaleString();
  return `${n(r.sent)} sent of ${n(r.targeted)} · at least ${n(r.delivered)} delivered · ${n(r.opened)} opened${r.failed ? ` · ${n(r.failed)} failed` : ''}${r.no_phone ? ` · ${n(r.no_phone)} without a phone` : ''}`;
}
