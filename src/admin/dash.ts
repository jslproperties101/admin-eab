// AdminBatch005 — plain functions behind the Dashboards (no browser needed, so they are unit-tested):
//   * the date filter (7 / 30 / 90 days, 12 months, custom) and which bucket (day / week / month) suits it
//   * labels for listing statuses (same words as the main app), languages, screens and features
//   * version sorting, percentages, the day x hour heatmap grid
import { addDays, daysSince } from './health';
import { Bucket, DashUsage } from '../api/admin';

export type RangeKey = '7' | '30' | '90' | '365' | 'custom';
export interface Range { key: RangeKey; from: string; to: string }
export const RANGE_LABEL: Record<RangeKey, string> = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', '365': 'Last 12 months', custom: 'Custom' };
export const MAX_RANGE_DAYS = 731;

/** The period for a preset, ending today (Malaysia date). */
export function presetRange(key: Exclude<RangeKey, 'custom'>, today: string): Range {
  return { key, from: addDays(today, -(Number(key) - 1)), to: today };
}

/** Checks a custom period; returns the problem in plain words, or null when it is fine. */
export function rangeProblem(from: string, to: string, today: string): string | null {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (!ok(from) || !ok(to)) return 'Pick both dates.';
  if (from > to) return 'The start date is after the end date.';
  if (to > today) return 'The end date is in the future.';
  if ((daysSince(from, to) ?? 0) + 1 > MAX_RANGE_DAYS) return 'Pick at most 2 years.';
  return null;
}

export const rangeDays = (r: { from: string; to: string }) => (daysSince(r.from, r.to) ?? 0) + 1;

/** Day bars up to 62 days, weeks up to 26 weeks, months after that. */
export const bucketFor = (days: number): Bucket => (days <= 62 ? 'day' : days <= 182 ? 'week' : 'month');
export const BUCKET_LABEL: Record<Bucket, string> = { day: 'per day', week: 'per week', month: 'per month' };

export const pctOf = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);
export const fmtPct0 = (p: number | null | undefined): string => (p === null || p === undefined || !Number.isFinite(p) ? '—' : `${Math.round(p)}%`);
export const fmtNum = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-MY', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Newest version first: 2.10.0 before 2.9.1 before 2.9.0; "?" last. */
export function cmpVersionDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (a === '?') return 1;
  if (b === '?') return -1;
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? '';
    const nx = Number(x), ny = Number(y);
    const d = x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny) ? ny - nx : y.localeCompare(x);
    if (d) return d;
  }
  return 0;
}

// Listing statuses, in the order and words of the main app (listing/strings.ts, Change 40/41).
export const STATUS_ORDER = ['available', 'booked_pending_spa', 'booked_other_agent', 'booked_pending_consent', 'booked',
  'booked_pending_loan', 'booked_spa_signed', 'sold', 'rented_pending_ta', 'rented', 'off_market', 'needs_check', 'none'] as const;
export const LISTING_STATUS: Record<string, string> = {
  available: 'Available', booked: 'Booked', booked_pending_loan: 'Booked - Pending Loan', booked_pending_spa: 'Booked - Pending SPA',
  booked_spa_signed: 'Booked - SPA Signed', booked_other_agent: 'Booked - Other Agent (Pending SPA)', booked_pending_consent: 'Booked - Pending Consent',
  sold: 'Sold', rented_pending_ta: 'Rented - Pending TA Signing', rented: 'Rented', off_market: 'Withdrawn', needs_check: 'Needs check', none: 'No status yet',
};
export const statusLabel = (k: string) => LISTING_STATUS[k] ?? k;
export const PIPELINE_LABEL: Record<string, string> = {
  booked: 'Booked', booked_pending_loan: 'Pending loan', booked_spa_signed: 'SPA signed', sold: 'Sold',
  rented_pending_ta: 'Rented - Pending TA Signing', rented: 'Rented',
};
export const PURPOSE_LABEL: Record<string, string> = { sale: 'For sale', rent: 'For rent', sale_or_rent: 'Sale or rent', none: 'Not set' };

export function sortStatuses(by: Record<string, number>): { key: string; label: string; n: number }[] {
  const known = STATUS_ORDER.filter(k => by[k]).map(k => ({ key: k, label: statusLabel(k), n: by[k] }));
  const other = Object.keys(by).filter(k => !(STATUS_ORDER as readonly string[]).includes(k) && by[k]).sort().map(k => ({ key: k, label: statusLabel(k), n: by[k] }));
  return [...known, ...other];
}

export const LANGUAGE_LABEL: Record<string, string> = { en: 'English', ms: 'Bahasa Melayu', bm: 'Bahasa Melayu', zh: 'Chinese', unknown: 'Not recorded' };
export const languageLabel = (l: string) => LANGUAGE_LABEL[l] ?? l;

/** Main-app screen and feature names in plain words; anything new shows as recorded. */
const NAME_LABEL: Record<string, string> = {
  home: 'Home', listing: 'Listings', 'listing-detail': 'Listing details', 'listing-form': 'Add / edit listing', notifications: 'Notifications',
  opportunities: 'Opportunities', voice: 'Voice / AI command', expert: 'Ask Expert', 'expert-ask': 'Ask Expert — new question', 'expert-thread': 'Ask Expert — thread',
  'contacts-home': 'Contacts home', contacts: 'Contacts', 'contact-detail': 'Contact details', 'contact-form': 'Add / edit contact',
  'creative-media': 'Creative media', projects: 'Projects', 'project-form': 'Add / edit project', profile: 'Profile', 'profile-edit': 'Edit profile',
  'coming-soon': 'Coming-soon screen', 'buyer-matching': 'Buyer matching', 'buyer-matches': 'Buyer matches', 'buyer-pdf': 'Buyer PDF',
  activity: 'Activity', team: 'Team', calculator: 'Calculator', calendar: 'Calendar', 'marketing-studio': 'Marketing Studio', 'photo-studio': 'Photo studio',
  'task-form': 'Add / edit task', 'track-sales': 'Track sales', gps: 'GPS', finance: 'Finance', journey: 'Journey', settings: 'Settings',
  todo: 'To-do', 'appt-form': 'Add / edit appointment', deal: 'Deal', 'house-shopping': 'House Shopping', 'dev-dashboard': 'Developer dashboard',
  'manage-sharing': 'Manage sharing', 'property-map': 'Property map',
  'file.add': 'File added', 'team.invite': 'Team invite sent', 'team.accept': 'Team invite accepted', 'team.leave': 'Left a team',
  'properties.create': 'Listing created', 'properties.edit': 'Listing edited', 'contacts.create': 'Contact created', 'journeys.create': 'Journey saved',
  'appointments.create': 'Appointment created', 'expert-threads.create': 'Ask Expert question',
  'geocoding.reverse': 'Google: place name lookup', 'maps.map': 'Google: map shown', 'maps.load': 'Google: web map load', 'roads.snap': 'Google: snap to roads',
  'sync.run': 'Sync', 'session.start': 'App opened', 'session.active': 'App in use',
};
export const nameLabel = (name: string) => NAME_LABEL[name] ?? (name.startsWith('lang.') ? `Language: ${languageLabel(name.slice(5))}` : name);
export const KIND_LABEL: Record<string, string> = { screen: 'Screen', feature: 'Feature', google: 'Google', sync: 'Sync', session: 'Session', language: 'Language' };
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

export const DOW_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** 7 x 24 grid (Monday first) from the heatmap rows; also returns the biggest cell for shading. */
export function heatGrid(rows: DashUsage['heatmap']): { grid: number[][]; max: number } {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let max = 0;
  for (const r of rows) {
    if (r.dow < 1 || r.dow > 7 || r.hour < 0 || r.hour > 23) continue;
    grid[r.dow - 1][r.hour] += r.events;
    max = Math.max(max, grid[r.dow - 1][r.hour]);
  }
  return { grid, max };
}

/** Label for a chart bucket start date. */
export function bucketLabel(start: string, bucket: Bucket): string {
  if (bucket === 'month') return start.slice(0, 7);
  if (bucket === 'week') return `wk of ${start}`;
  return start;
}

export const AT_RISK_REASON: Record<string, string> = { no_activity_14d: 'Nothing for 14+ days', activity_halved: 'Use dropped by more than half' };
