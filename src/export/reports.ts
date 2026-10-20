// Builds the Agent Profile compliance export (PDF blocks and Excel sheets) from what the database returned.
// Pure functions (no browser needed), so they are unit-tested.
import { Block, Doc } from '../lib/pdf';
import { AgentProfile, AgentRecord, Version } from '../api/admin';
import { Sheet, Cell } from './xlsx';

export const COLLECTION_LABEL: Record<string, string> = {
  properties: 'Listings', deals: 'Deals', contacts: 'Contacts', journeys: 'House Shopping journeys', banners: 'Banner positions',
  appointments: 'Appointments', targets: 'Targets', expertThreads: 'Ask Expert threads',
};
export const labelOf = (c: string) => COLLECTION_LABEL[c] ?? c;
/** Order collections are shown and exported in (listings first: the core compliance purpose). */
export const COLLECTION_ORDER = ['properties', 'deals', 'journeys', 'banners', 'contacts', 'appointments', 'targets', 'expertThreads'];
export const sortCollections = (cs: string[]) =>
  [...cs].sort((a, b) => (COLLECTION_ORDER.indexOf(a) + 1 || 99) - (COLLECTION_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

/** Field names in plain words (camelCase → "Camel case"). */
export function fieldLabel(k: string): string {
  const special: Record<string, string> = { refNo: 'Ref number', unitNo: 'Unit no.', landSqft: 'Land (sq ft)', lat: 'Latitude', lng: 'Longitude', id: 'Record ID' };
  if (special[k]) return special[k];
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isTime = (k: string, v: unknown) => typeof v === 'number' && v > 1_000_000_000_000 && v < 5_000_000_000_000 && /(created|updated|at|date|time|placedOn)$/i.test(k);

/** One value as readable text. Long lists (GPS points, photos) are summarised; nested objects shown compactly. */
export function valueText(k: string, v: unknown, max = 1500): string {
  if (v === null || v === undefined || v === '') return '';
  if (isTime(k, v)) return fmtTime(new Date(v as number).toISOString());
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' || typeof v === 'string') return String(v).slice(0, max);
  if (Array.isArray(v)) {
    if (k === 'points') return `${v.length} GPS points`;
    if (k === 'photos') return `${v.length} photo(s)`;
    if (v.every(x => typeof x !== 'object')) return v.join(', ').slice(0, max);
    return `${v.length} item(s): ${JSON.stringify(v)}`.slice(0, max);
  }
  return JSON.stringify(v).slice(0, max);
}

/** Every field of a record as label/value pairs, in a stable order (identity and status first). */
export function recordFields(r: Pick<AgentRecord, 'data'>): { k: string; v: string }[] {
  const d = r.data ?? {};
  const first = ['ref', 'refNo', 'title', 'headline', 'name', 'status', 'availability', 'type', 'askingPrice', 'unitNo', 'street', 'neighborhood', 'city', 'state', 'country'];
  const keys = Object.keys(d);
  const ordered = [...first.filter(k => keys.includes(k)), ...keys.filter(k => !first.includes(k)).sort()];
  return ordered.map(k => ({ k: fieldLabel(k), v: valueText(k, d[k]) })).filter(x => x.v !== '');
}

export function recordTitle(r: Pick<AgentRecord, 'data' | 'id'>): string {
  const d = r.data ?? {};
  const pick = (k: string) => (typeof d[k] === 'string' && d[k] ? String(d[k]) : '');
  return pick('ref') || pick('title') || pick('headline') || pick('name') || r.id;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // Malaysia time, written the same way on every device
  const my = new Date(d.getTime() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${my.getUTCFullYear()}-${p(my.getUTCMonth() + 1)}-${p(my.getUTCDate())} ${p(my.getUTCHours())}:${p(my.getUTCMinutes())} MYT`;
}

export interface ExportInput {
  reference: string; createdAt: string; adminEmail: string; companyName?: string;
  profile: AgentProfile;
  records: Record<string, AgentRecord[]>;   // by collection
  histories?: Record<string, Version[]>;    // key `${collection}/${id}`
}

export function profileRows(p: AgentProfile): { k: string; v: string }[] {
  return [
    { k: 'Name', v: p.name ?? '' },
    { k: 'Email', v: p.email },
    { k: 'User ID', v: p.user_id },
    { k: 'Account status', v: p.status },
    { k: 'Licence', v: p.licence ?? 'Not provided' },
    { k: 'Joined', v: fmtTime(p.joined_at) },
    { k: 'Last sign-in', v: fmtTime(p.last_sign_in_at) },
    { k: 'Workspaces', v: p.workspaces.map(w => `${w.name} (${w.role})`).join(', ') },
  ];
}

export function buildProfileDoc(x: ExportInput): Doc {
  const blocks: Block[] = [
    { t: 'title', text: 'Agent compliance record', sub: `${x.companyName ? `${x.companyName} · ` : ''}Reference ${x.reference}` },
    { t: 'rows', rows: [
      { k: 'Exported', v: fmtTime(x.createdAt) },
      { k: 'Exported by', v: x.adminEmail },
      { k: 'Reference', v: x.reference, strong: true },
    ] },
    { t: 'heading', text: 'Agent' },
    { t: 'rows', rows: profileRows(x.profile) },
    { t: 'heading', text: 'Record counts' },
    { t: 'rows', rows: sortCollections(Object.keys(x.profile.counts)).map(c => ({
      k: labelOf(c), v: `${x.profile.counts[c].total}${x.profile.counts[c].deleted ? ` (${x.profile.counts[c].deleted} deleted)` : ''}` })) },
  ];
  for (const c of sortCollections(Object.keys(x.records))) {
    const list = x.records[c];
    if (!list.length) continue;
    blocks.push({ t: 'heading', text: `${labelOf(c)} (${list.length})` });
    for (const r of list) {
      blocks.push({ t: 'text', text: `${recordTitle(r)}${r.deleted ? '  — DELETED (kept for audit)' : ''}`, bold: true });
      blocks.push({ t: 'rows', rows: [
        { k: 'Version', v: String(r.rev), sub: true }, { k: 'Last saved', v: fmtTime(r.written_at), sub: true },
        ...recordFields(r),
      ] });
      const h = x.histories?.[`${c}/${r.id}`];
      if (h && h.length > 1) {
        blocks.push({ t: 'text', text: `Change history: ${h.length} versions`, small: true, muted: true });
        for (const line of historyLines(h)) blocks.push({ t: 'text', text: line, small: true });
      }
      blocks.push({ t: 'rule' });
    }
  }
  blocks.push({ t: 'space', h: 8 });
  blocks.push({ t: 'text', text: 'Generated by Admin EAB from the live database. Every export is recorded in the tamper-proof access log under the reference above.', small: true, muted: true });
  return { blocks, footer: `Admin EAB · ${x.reference} · ${fmtTime(x.createdAt)}` };
}

/** "v3 → v4 (2026-10-20 14:02 MYT): Asking price 500000 → 480000; Status Available → Booked" */
export function historyLines(versions: Version[]): string[] {
  const asc = [...versions].sort((a, b) => a.rev - b.rev);
  const out: string[] = [];
  for (let i = 1; i < asc.length; i++) {
    const before = asc[i - 1], after = asc[i];
    const changes = diff(before.data ?? {}, after.data ?? {});
    const del = before.deleted !== after.deleted ? [`Deleted ${before.deleted ? 'Yes' : 'No'} → ${after.deleted ? 'Yes' : 'No'}`] : [];
    const all = [...del, ...changes.map(c => `${fieldLabel(c.k)} ${c.before || '(empty)'} → ${c.after || '(empty)'}`)];
    out.push(`v${before.rev} → v${after.rev} (${fmtTime(after.saved_at)}): ${all.length ? all.join('; ') : 'no field changes'}`.slice(0, 1500));
  }
  return out;
}

export function diff(a: Record<string, unknown>, b: Record<string, unknown>): { k: string; before: string; after: string }[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => k !== 'updated').sort();
  const out: { k: string; before: string; after: string }[] = [];
  for (const k of keys) {
    const x = valueText(k, a[k], 200), y = valueText(k, b[k], 200);
    if (x !== y) out.push({ k, before: x, after: y });
  }
  return out;
}

export function buildProfileSheets(x: ExportInput): Sheet[] {
  const sheets: Sheet[] = [{
    name: 'Agent',
    rows: [['Field', 'Value'],
      ['Reference', x.reference], ['Exported', fmtTime(x.createdAt)], ['Exported by', x.adminEmail],
      ...profileRows(x.profile).map(r => [r.k, r.v] as Cell[]),
      ...sortCollections(Object.keys(x.profile.counts)).map(c => [`${labelOf(c)} (total / deleted)`, `${x.profile.counts[c].total} / ${x.profile.counts[c].deleted}`] as Cell[])],
    widths: [30, 60],
  }];
  for (const c of sortCollections(Object.keys(x.records))) {
    const list = x.records[c];
    if (!list.length) continue;
    const keys = [...new Set(list.flatMap(r => Object.keys(r.data ?? {})))].sort();
    sheets.push({
      name: labelOf(c),
      rows: [['Record ID', 'Deleted', 'Version', 'Last saved', ...keys.map(fieldLabel)],
        ...list.map(r => [r.id, r.deleted ? 'Yes' : 'No', r.rev, fmtTime(r.written_at), ...keys.map(k => valueText(k, (r.data ?? {})[k], 30000))] as Cell[])],
      widths: [22, 9, 9, 20, ...keys.map(() => 22)],
    });
  }
  if (x.histories && Object.keys(x.histories).length) {
    const rows: Cell[][] = [['Collection', 'Record ID', 'From version', 'To version', 'Saved', 'Field', 'Before', 'After']];
    for (const [key, vs] of Object.entries(x.histories)) {
      const [c, id] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
      const asc = [...vs].sort((a, b) => a.rev - b.rev);
      for (let i = 1; i < asc.length; i++) {
        for (const d of diff(asc[i - 1].data ?? {}, asc[i].data ?? {}))
          rows.push([labelOf(c), id, asc[i - 1].rev, asc[i].rev, fmtTime(asc[i].saved_at), fieldLabel(d.k), d.before, d.after]);
        if (asc[i - 1].deleted !== asc[i].deleted)
          rows.push([labelOf(c), id, asc[i - 1].rev, asc[i].rev, fmtTime(asc[i].saved_at), 'Deleted', asc[i - 1].deleted ? 'Yes' : 'No', asc[i].deleted ? 'Yes' : 'No']);
      }
    }
    sheets.push({ name: 'Change history', rows, widths: [18, 22, 8, 8, 20, 20, 40, 40] });
  }
  return sheets;
}

export const exportFileName = (reference: string, email: string, ext: 'pdf' | 'xlsx') =>
  `${reference}-${(email.split('@')[0] || 'agent').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30)}.${ext}`;
