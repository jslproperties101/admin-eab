// AdminBatch009 — plain functions behind the Listings & market screen (no browser needed, so they are unit-tested):
//   * the listing quality score — the SAME rule as the database function eab_mkt_score (keep the two in step)
//   * labels for what is missing, score bands, money, percentages, stages, best times to post
import { DOW_LABEL, statusLabel } from './dash';

/** Joe, 23 Oct 2026: a Booked deal counts as stuck after 30 days with no change. */
export const STUCK_DAYS = 30;
export const STUCK_CHOICES = [30, 45, 60, 90] as const;
/** Listings below this score are on the "needs work" list. */
export const GOOD_SCORE = 80;

export const MISSING_LABEL: Record<string, string> = {
  photos: 'No photos', more_photos: 'Fewer than 5 photos', price: 'No price or rent', title_type: 'No title type', tenure: 'No tenure',
  size: 'No land or built-up size', rooms: 'No bedrooms or bathrooms', location: 'No state or city', map_pin: 'No map pin',
};
export const missingLabel = (k: string) => MISSING_LABEL[k] ?? k;
/** The order the "what is missing" chart uses (biggest points first). */
export const MISSING_ORDER = ['photos', 'more_photos', 'price', 'location', 'title_type', 'tenure', 'size', 'rooms', 'map_pin'];

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v.trim())) return Number(v.trim());
  return null;
};
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const NO_ROOMS = /(land|commercial|industrial|agricultur|factory|warehouse|shop|office)/i;

/** Listing quality score out of 100 and what is missing.
 *  photos 30 (5+ = 30, 1-4 = 15) · price 15 · title type 10 · tenure 10 · size 10 · rooms 10 (free for land and
 *  commercial lots) · location 15 (state + city 10, map pin 5). */
export function qualityScore(d: Json): { score: number; photos: number; missing: string[] } {
  const photos = Array.isArray(d.photos) ? d.photos.length : 0;
  const price = (num(d.askingPrice) ?? 0) > 0 || (num(d.monthlyRent) ?? 0) > 0;
  const title = filled(d.titleType), tenure = filled(d.tenure);
  const size = (num(d.landSqft) ?? 0) > 0 || (num(d.builtUpSqft) ?? 0) > 0;
  const rooms = (num(d.bedrooms) ?? 0) > 0 || (num(d.bathrooms) ?? 0) > 0 || NO_ROOMS.test(typeof d.type === 'string' ? d.type : '');
  const place = filled(d.state) && filled(d.city);
  const pin = num(d.lat) !== null && num(d.lng) !== null;
  const score = (photos >= 5 ? 30 : photos >= 1 ? 15 : 0) + (price ? 15 : 0) + (title ? 10 : 0) + (tenure ? 10 : 0)
    + (size ? 10 : 0) + (rooms ? 10 : 0) + (place ? 10 : 0) + (pin ? 5 : 0);
  const missing = [
    photos === 0 ? 'photos' : photos < 5 ? 'more_photos' : null, price ? null : 'price', title ? null : 'title_type', tenure ? null : 'tenure',
    size ? null : 'size', rooms ? null : 'rooms', place ? null : 'location', pin ? null : 'map_pin',
  ].filter((x): x is string => !!x);
  return { score, photos, missing };
}

export type Band = 'good' | 'fair' | 'poor';
export const bandOf = (score: number): Band => (score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor');
export const BAND_LABEL: Record<Band, string> = { good: 'Good (80+)', fair: 'Fair (50-79)', poor: 'Poor (under 50)' };
export const bandLevel = (b: Band): 'ok' | 'amber' | 'red' => (b === 'good' ? 'ok' : b === 'fair' ? 'amber' : 'red');

/** RM with thousands separators; big amounts shortened (RM 1.25m) when asked. */
export function fmtRm(n: number | null | undefined, short = false): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (short && Math.abs(v) >= 1_000_000) return `RM ${(v / 1_000_000).toLocaleString('en-MY', { maximumFractionDigits: 2 })}m`;
  if (short && Math.abs(v) >= 10_000) return `RM ${(v / 1000).toLocaleString('en-MY', { maximumFractionDigits: 1 })}k`;
  return `RM ${v.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
}

/** +3.5% / -5% / 0% (one decimal at most). */
export function fmtSignedPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return '—';
  const v = Math.round(Number(p) * 10) / 10;
  return `${v > 0 ? '+' : ''}${v.toLocaleString('en-MY', { maximumFractionDigits: 1 })}%`;
}

/** Days, or "—" when unknown. */
export const fmtDays = (d: number | null | undefined) => (d === null || d === undefined || !Number.isFinite(Number(d)) ? '—' : `${Math.round(Number(d))} d`);

/** Stage names: listing statuses plus "not linked" for deals without a listing. */
export const stageLabel = (k: string) => (k === 'not_linked' ? 'Not linked to a listing' : k === 'none' ? 'No status' : statusLabel(k));
export const SIDE_LABEL: Record<string, string> = { sale: 'Sale', rent: 'Rental' };
export const sideLabel = (s: string) => SIDE_LABEL[s] ?? s;
export const AUDIENCE_LABEL: Record<string, string> = { all: 'Everyone', groups: 'Chosen groups', codes: 'Invitation code only' };
export const audienceLabel = (a: string) => AUDIENCE_LABEL[a] ?? a;

/** "Tue 09:00-10:00" for a heatmap cell (isodow 1 = Monday). */
export const slotLabel = (dow: number, hour: number) =>
  `${DOW_LABEL[(dow - 1 + 7) % 7]} ${String(hour).padStart(2, '0')}:00-${String((hour + 1) % 24).padStart(2, '0')}:00`;

/** Hours after publishing, in words: "40 min", "3.5 h", "2.1 days". */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(Number(h))) return '—';
  const v = Number(h);
  if (v < 1) return `${Math.max(1, Math.round(v * 60))} min`;
  if (v < 48) return `${Math.round(v * 10) / 10} h`;
  return `${Math.round((v / 24) * 10) / 10} days`;
}

/** Background shade for a hot-areas cell: 0 = none, 1 = the busiest area. */
export const heatShade = (level: number) => (level > 0 ? `rgba(212, 175, 55, ${(0.15 + 0.85 * Math.min(1, level)).toFixed(2)})` : undefined);

/** A month key "2026-11" → "Nov 2026". */
export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]} ${y}`;
}
