// AdminBatch010 — plain functions behind the Moderation and Content insight screens (no browser needed, unit-tested):
//   * labels for moderation reasons and statuses, contact roles, enquiry channels and duplicate kinds
//   * map maths for the in-app map (Web Mercator tiles, fitting points, grouping nearby points into bubbles)
import { ModReason, ModStatus } from '../api/admin';

export const MOD_REASON_LABEL: Record<ModReason, string> = {
  price_far: 'Price far from the area', no_title_type: 'No title type', no_price: 'No price or rent', no_photos: 'No photos after 14 days',
  same_photo: 'Same photo as another agent', same_spot: 'Same spot as another agent', same_address: 'Same unit address as another agent',
  wrong_photo: 'Photo does not match the listing', offensive_photo: 'Unsuitable photo', misleading: 'Misleading details', other: 'Other',
};
export const modReasonLabel = (r: string) => MOD_REASON_LABEL[r as ModReason] ?? humanize(r);
/** Reasons an admin can pick when raising a listing case by hand. */
export const LISTING_REASONS: ModReason[] = ['misleading', 'price_far', 'no_title_type', 'no_price', 'same_photo', 'same_spot', 'same_address', 'other'];
/** Reasons for flagging a photo. */
export const PHOTO_REASONS: ModReason[] = ['wrong_photo', 'offensive_photo', 'same_photo', 'misleading', 'other'];

export const MOD_STATUS_LABEL: Record<ModStatus, string> = { open: 'Open', cleared: 'Cleared (nothing wrong)', confirmed: 'Confirmed (agent asked to fix)', referred: 'Referred to a complaint' };
export const modStatusLabel = (s: string) => MOD_STATUS_LABEL[s as ModStatus] ?? humanize(s);
export const modStatusTag = (s: string) => (s === 'open' ? 'amber' : s === 'confirmed' || s === 'referred' ? 'red' : 'ok');
export const MOD_SOURCE_LABEL: Record<string, string> = { admin: 'Raised by an admin', suspect: 'From the automatic checks', photo_review: 'From photo review' };

export const CONTACT_ROLE_LABEL: Record<string, string> = {
  buyer: 'Buyers', vendor: 'Vendors (owners)', tenant: 'Tenants', landlord: 'Landlords', professional: 'Professionals', other: 'Others',
};
export const contactRoleLabel = (r: string) => CONTACT_ROLE_LABEL[r] ?? humanize(r);
export const VENDOR_STATUS_LABEL: Record<string, string> = { not_set: 'Not set', pending_info: 'Waiting for information', active: 'Active', inactive: 'Inactive' };
export const vendorStatusLabel = (s: string) => VENDOR_STATUS_LABEL[s] ?? humanize(s);
export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', phone: 'Phone call', call: 'Phone call', walk_in: 'Walk-in', email: 'Email', portal: 'Property portal', social: 'Social media',
  referral: 'Referral', not_set: 'Not set',
};
export const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? humanize(c);
export const DUP_KIND_LABEL: Record<string, string> = { photo: 'Same photo', address: 'Same unit address', spot: 'Same map spot (within ~10 m)' };

/** "pending_info" → "Pending info". */
export function humanize(k: string): string {
  const t = String(k ?? '').replace(/[_-]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '—';
}

/** RM per sq ft, two decimals at most. */
export const fmtPpsf = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : `RM ${Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 })} psf`;

/** Bytes in words (photos are small). */
export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined || !Number.isFinite(Number(b))) return '—';
  const v = Number(b);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / 1024 / 1024).toLocaleString('en-MY', { maximumFractionDigits: 1 })} MB`;
}

// ---------------------------------------------------------------- map maths (Web Mercator, 256 px tiles)
export const TILE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 17;
/** Malaysia: used when there is nothing to fit. */
export const MALAYSIA = { south: 0.85, west: 99.6, north: 7.4, east: 119.3 };

export interface Px { x: number; y: number }
/** World pixel of a place at a zoom level. */
export function project(lat: number, lng: number, z: number): Px {
  const n = TILE * 2 ** z;
  const la = Math.max(-85.05112878, Math.min(85.05112878, lat)) * (Math.PI / 180);
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n };
}
/** The place at a world pixel (inverse of project). */
export function unproject(p: Px, z: number): { lat: number; lng: number } {
  const n = TILE * 2 ** z;
  const lng = (p.x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * p.y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

export interface View { lat: number; lng: number; z: number }
/** Centre and zoom that show every point in a w × h box (with a margin). Falls back to Malaysia. */
export function fitView(points: { lat: number; lng: number }[], w: number, h: number, pad = 28): View {
  const pts = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const b = pts.length
    ? { south: Math.min(...pts.map(p => p.lat)), north: Math.max(...pts.map(p => p.lat)), west: Math.min(...pts.map(p => p.lng)), east: Math.max(...pts.map(p => p.lng)) }
    : MALAYSIA;
  const cw = Math.max(40, w - 2 * pad), ch = Math.max(40, h - 2 * pad);
  let z = MAX_ZOOM;
  for (; z > MIN_ZOOM; z--) {
    const a = project(b.north, b.west, z), c = project(b.south, b.east, z);
    if (c.x - a.x <= cw && c.y - a.y <= ch) break;
  }
  if (pts.length === 1) z = Math.min(z, 14);
  const a = project(b.north, b.west, z), c = project(b.south, b.east, z);
  const mid = unproject({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, z);
  return { lat: mid.lat, lng: mid.lng, z };
}

/** Tiles needed to cover a w × h box around the centre: [{z, x, y, left, top}] (x wraps around the world). */
export function tilesFor(v: View, w: number, h: number): { key: string; z: number; x: number; y: number; left: number; top: number }[] {
  const c = project(v.lat, v.lng, v.z);
  const x0 = c.x - w / 2, y0 = c.y - h / 2;
  const n = 2 ** v.z, out = [];
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({ key: `${v.z}/${tx}/${ty}`, z: v.z, x: wx, y: ty, left: tx * TILE - x0, top: ty * TILE - y0 });
    }
  }
  return out;
}

/** Screen position of a place in the w × h box. */
export function toScreen(lat: number, lng: number, v: View, w: number, h: number): Px {
  const c = project(v.lat, v.lng, v.z), p = project(lat, lng, v.z);
  return { x: p.x - c.x + w / 2, y: p.y - c.y + h / 2 };
}

export interface Bubble<T> { x: number; y: number; items: T[]; weight: number }
/** Groups points closer than `cell` pixels into one bubble (weight = sum of each point's weight, default 1). */
export function cluster<T extends { lat: number; lng: number }>(points: T[], v: View, w: number, h: number, cell = 34, weight: (p: T) => number = () => 1): Bubble<T>[] {
  const grid = new Map<string, Bubble<T>>();
  for (const p of points) {
    const s = toScreen(p.lat, p.lng, v, w, h);
    if (s.x < -cell || s.y < -cell || s.x > w + cell || s.y > h + cell) continue;
    const key = `${Math.floor(s.x / cell)}:${Math.floor(s.y / cell)}`;
    const b = grid.get(key);
    if (b) { b.x = (b.x * b.items.length + s.x) / (b.items.length + 1); b.y = (b.y * b.items.length + s.y) / (b.items.length + 1); b.items.push(p); b.weight += weight(p); }
    else grid.set(key, { x: s.x, y: s.y, items: [p], weight: weight(p) });
  }
  return [...grid.values()];
}

/** Bubble size in pixels for a weight (log scale, 26 to 52 px — big enough to tap on a phone). */
export const bubbleSize = (weight: number) => Math.round(Math.min(52, 26 + Math.log2(Math.max(1, weight)) * 6));

/** Listing status → map dot class. */
export function dotClass(status: string): 'avail' | 'booked' | 'closed' | 'other' {
  if (status === 'available' || status === 'none' || status === 'needs_check') return 'avail';
  if (status.startsWith('booked')) return 'booked';
  if (['sold', 'rented', 'rented_pending_ta', 'off_market'].includes(status)) return 'closed';
  return 'other';
}
