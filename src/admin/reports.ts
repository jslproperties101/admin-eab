// AdminBatch008 — plain functions behind the Reports screens (unit-tested, no browser):
// the report-builder draft and its checks (the database checks the same again), how cells are written,
// the chart behind a grouped report, the Board report's "this month vs last month" lines, month and year choices.
import { BoardNumbers, BoardReport, ReportCol, ReportColType, ReportFilter, ReportOp, ReportResult, ReportRow, ReportSource, ReportSpec } from '../api/admin';
import { COMPLAINT_CATEGORY, PDPA_KIND } from './compliance';
import { fmtNum, statusLabel } from './dash';

export const MAX_ROWS = 5000;
export const MAX_FILTERS = 10;
export const MAX_GROUPS = 2;

export const OP_LABEL: Record<ReportOp, string> = {
  contains: 'contains', eq: 'is exactly', in: 'is one of', min: 'at least', max: 'at most', after: 'on or after', before: 'on or before', is: 'is',
};
/** Which filters fit which kind of column (the same list the database accepts). */
export function opsFor(t: ReportColType): ReportOp[] {
  return t === 'text' ? ['contains', 'eq', 'in', 'is'] : t === 'num' ? ['min', 'max', 'eq', 'is'] : t === 'date' ? ['after', 'before', 'is'] : ['is'];
}
export const IS_VALUES: Record<string, string> = { true: 'Yes', false: 'No', empty: 'empty', not_empty: 'not empty' };
export const isValuesFor = (t: ReportColType) => (t === 'bool' ? ['true', 'false', 'empty', 'not_empty'] : ['empty', 'not_empty']);

/** What the screen edits. `filters[].value` is what was typed ("in" = comma-separated). */
export interface Draft {
  source: string; mode: 'rows' | 'totals'; columns: string[]; group_by: string[]; measure: string;
  from: string; to: string; filters: { col: string; op: ReportOp; value: string }[]; sortBy: string; sortDir: 'asc' | 'desc'; limit: number;
}
export function newDraft(source: string, src: ReportSource | undefined, canNames: boolean): Draft {
  const cols = Object.entries(src?.columns ?? {}).filter(([, c]) => canNames || !c.p).map(([k]) => k);
  return { source, mode: canNames ? 'rows' : 'totals', columns: cols.slice(0, 4), group_by: canNames ? [] : cols.slice(0, 1), measure: 'count',
    from: '', to: '', filters: [], sortBy: '', sortDir: 'desc', limit: 1000 };
}

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const filterValue = (f: Draft['filters'][number], t: ReportColType | undefined): ReportFilter['value'] =>
  f.op === 'in' ? f.value.split(',').map(v => v.trim()).filter(Boolean)
    : (f.op === 'min' || f.op === 'max') && t === 'num' ? Number(f.value) : f.value.trim();

/** The spec sent to the database. Filters with nothing typed are left out. */
export function draftToSpec(d: Draft, src: ReportSource | undefined): ReportSpec {
  const spec: ReportSpec = { source: d.source, limit: Math.min(Math.max(Math.round(d.limit) || 1000, 1), MAX_ROWS) };
  if (d.mode === 'rows') spec.columns = [...d.columns];
  else { spec.group_by = [...d.group_by]; spec.measure = d.measure || 'count'; }
  if (d.from) spec.from = d.from;
  if (d.to) spec.to = d.to;
  const filters = d.filters.filter(f => f.col && (f.op === 'is' ? !!f.value : f.value.trim() !== ''))
    .map(f => ({ col: f.col, op: f.op, value: filterValue(f, src?.columns[f.col]?.t) }));
  if (filters.length) spec.filters = filters;
  if (d.sortBy) spec.sort = { by: d.sortBy, dir: d.sortDir };
  return spec;
}
export function specToDraft(s: ReportSpec): Draft {
  const grouped = (s.group_by?.length ?? 0) > 0;
  return {
    source: s.source, mode: grouped ? 'totals' : 'rows', columns: s.columns ?? [], group_by: s.group_by ?? [], measure: s.measure ?? 'count',
    from: s.from ?? '', to: s.to ?? '', sortBy: s.sort?.by ?? '', sortDir: s.sort?.dir ?? 'desc', limit: s.limit ?? 1000,
    filters: (s.filters ?? []).map(f => ({ col: f.col, op: f.op, value: Array.isArray(f.value) ? f.value.join(', ') : String(f.value) })),
  };
}

/** Everything wrong with a draft, in plain words (empty = ready to run). */
export function draftProblems(d: Draft, src: ReportSource | undefined, canNames: boolean): string[] {
  const out: string[] = [];
  if (!src) return ['Choose what the report is about.'];
  const col = (k: string): ReportCol | undefined => src.columns[k];
  const personal = (k: string) => !!col(k)?.p;
  if (d.mode === 'rows') {
    if (!canNames) out.push('Your role can only build totals (grouped counts).');
    if (!d.columns.length) out.push('Tick at least one column.');
  } else {
    if (!d.group_by.length) out.push('Choose what to group by.');
    if (d.group_by.length > MAX_GROUPS) out.push(`Group by at most ${MAX_GROUPS} columns.`);
    if (d.measure !== 'count') {
      const m = d.measure.split(':')[1] ?? '';
      if (col(m)?.t !== 'num') out.push('A total or average needs a number column.');
    }
  }
  const used = [...(d.mode === 'rows' ? d.columns : d.group_by), ...d.filters.map(f => f.col)];
  if (used.some(k => k && !col(k))) out.push('A column is not in this report source.');
  if (!canNames && used.some(personal)) out.push('Names and emails are not shown to your role.');
  if (d.filters.length > MAX_FILTERS) out.push(`At most ${MAX_FILTERS} filters.`);
  for (const f of d.filters) {
    const c = col(f.col); if (!c) continue;
    if (!opsFor(c.t).includes(f.op)) out.push(`"${c.l}" cannot be filtered with "${OP_LABEL[f.op]}".`);
    else if ((f.op === 'min' || f.op === 'max' || (f.op === 'eq' && c.t === 'num')) && f.value.trim() !== '' && !Number.isFinite(Number(f.value))) out.push(`"${c.l}" needs a number.`);
    else if ((f.op === 'after' || f.op === 'before') && f.value && !isDay(f.value)) out.push(`"${c.l}" needs a date.`);
  }
  if (d.from && !isDay(d.from)) out.push('The "from" date is not a date.');
  if (d.to && !isDay(d.to)) out.push('The "to" date is not a date.');
  if (d.from && d.to && isDay(d.from) && isDay(d.to) && d.from > d.to) out.push('"From" must be before "to".');
  if (d.sortBy && d.sortBy !== 'value' && !(d.mode === 'rows' ? d.columns : d.group_by).includes(d.sortBy)) out.push('Sort by one of the chosen columns.');
  if (!(d.limit >= 1 && d.limit <= MAX_ROWS)) out.push(`Show between 1 and ${MAX_ROWS.toLocaleString('en-MY')} rows.`);
  return [...new Set(out)];
}

export function measureLabel(measure: string | undefined, src: ReportSource | undefined): string {
  if (!measure || measure === 'count') return 'How many';
  const [fn, c] = measure.split(':');
  const l = src?.columns[c]?.l ?? c;
  return fn === 'sum' ? `Total ${l}` : `Average ${l}`;
}
export interface Header { key: string; label: string; t: ReportColType }
export function resultHeaders(spec: ReportSpec, src: ReportSource | undefined): Header[] {
  const h = (k: string): Header => ({ key: k, label: src?.columns[k]?.l ?? k, t: src?.columns[k]?.t ?? 'text' });
  return spec.group_by?.length ? [...spec.group_by.map(h), { key: 'value', label: measureLabel(spec.measure, src), t: 'num' }] : (spec.columns ?? []).map(h);
}

/** A cell in plain words: empty → "—", true/false → Yes/No, numbers with thousands separators, listing statuses / categories named. */
export function cellText(v: ReportRow[string] | undefined, t: ReportColType, key = ''): string {
  if (v === null || v === undefined || v === '') return '—';
  if (t === 'bool') return v === true || v === 'true' ? 'Yes' : 'No';
  if (t === 'num') return typeof v === 'number' || Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-MY', { maximumFractionDigits: 2 }) : String(v);
  if (key === 'status' && typeof v === 'string') return statusLabel(v);
  if (key === 'category' && typeof v === 'string') return (COMPLAINT_CATEGORY as Record<string, string>)[v] ?? v;
  return String(v);
}
/** Value for Excel: numbers stay numbers, the rest as written on screen. */
export const cellValue = (v: ReportRow[string] | undefined, t: ReportColType, key = ''): string | number =>
  t === 'num' && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : cellText(v, t, key);

/** Bars for a grouped report: one per row (top 30), labelled by the group values. */
export function chartItems(spec: ReportSpec, res: ReportResult, src: ReportSource | undefined): { key: string; label: string; value: number }[] {
  const g = spec.group_by ?? [];
  if (!g.length) return [];
  return res.rows.slice(0, 30).map((r, i) => ({
    key: String(i), label: g.map(k => cellText(r[k], src?.columns[k]?.t ?? 'text', k)).join(' · '), value: Number(r.value) || 0,
  }));
}

// ---------- Board report ----------
export interface BoardLine { label: string; cur: number; prev: number | null; sub?: boolean; warn?: boolean; text?: string }
export interface BoardSection { title: string; lines: BoardLine[] }

/** "+3 (+25%)", "−2 (−10%)", "same", "new" (nothing last month). */
export function changeText(cur: number, prev: number | null): string {
  if (prev === null) return '';
  const d = cur - prev;
  if (d === 0) return 'same';
  if (prev === 0) return 'new';
  const pct = Math.round((d / prev) * 100);
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-MY')} (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%)`;
}
export const pctText = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

const REQUESTER: Record<string, string> = { jpph: 'JPPH', police: 'Police', court: 'Court', board: 'Board (LPPEH)', pdpa: 'PDPA (agent)', other: 'Other' };
const keysOf = (a: Record<string, number>, b: Record<string, number>) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();

/** Every line of the Board report, this period against the one before. */
export function boardSections(r: Pick<BoardReport, 'current' | 'previous'>): BoardSection[] {
  const c = r.current, p = r.previous;
  const L = (label: string, f: (n: BoardNumbers) => number, extra: Partial<BoardLine> = {}): BoardLine => ({ label, cur: f(c) ?? 0, prev: f(p) ?? 0, ...extra });
  const now = (label: string, f: (n: BoardNumbers) => number, extra: Partial<BoardLine> = {}): BoardLine => ({ label, cur: f(c) ?? 0, prev: null, ...extra });
  const pdpaPct = (n: BoardNumbers) => pctText(n.pdpa.answered_in_21, n.pdpa.with_deadline);
  return [
    { title: 'Agents', lines: [
      L('Agents at the end of the period', n => n.agents.total),
      L('New agents', n => n.agents.new),
      L('Agents who used the app', n => n.agents.active),
      L('Account status changes (suspend / ban / close / re-activate)', n => n.agents.status_changes),
      now('Accounts not active today', n => n.agents.not_active_now),
    ] },
    { title: 'Licences', lines: [
      now('Licences recorded', n => n.licences.total),
      now('Verified', n => n.licences.verified),
      L('Expired by the end of the period', n => n.licences.expired_at_end, { warn: c.licences.expired_at_end > 0 }),
      L('Expiring in the 60 days after', n => n.licences.expiring_60_after),
      now('No expiry date entered', n => n.licences.no_expiry_date),
    ] },
    { title: 'Listings', lines: [
      L('New listings', n => n.listings.new),
      L('Sold', n => n.listings.sold),
      L('Rented', n => n.listings.rented),
      now('Listings today (not deleted)', n => n.listings.live_now),
      ...Object.entries(c.listings.by_status_now ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: statusLabel(k), cur: v, prev: null, sub: true })),
    ] },
    { title: 'Complaints', lines: [
      L('Received', n => n.complaints.received),
      ...keysOf(c.complaints.by_category, p.complaints.by_category).map(k => L((COMPLAINT_CATEGORY as Record<string, string>)[k] ?? k, n => n.complaints.by_category?.[k] ?? 0, { sub: true })),
      L('Resolved, dismissed or referred', n => n.complaints.resolved),
      L('Still open at the end', n => n.complaints.open_at_end, { warn: c.complaints.open_at_end > 0 }),
    ] },
    { title: 'PDPA requests', lines: [
      L('Received', n => n.pdpa.received),
      ...keysOf(c.pdpa.by_kind, p.pdpa.by_kind).map(k => L((PDPA_KIND as Record<string, string>)[k] ?? k, n => n.pdpa.by_kind?.[k] ?? 0, { sub: true })),
      L('Access / correction (21-day rule)', n => n.pdpa.with_deadline),
      L('Answered within 21 days', n => n.pdpa.answered_in_21, { text: `${pdpaPct(c)} (last: ${pdpaPct(p)})` }),
      L('Late (over 21 days)', n => n.pdpa.late, { warn: c.pdpa.late > 0 }),
    ] },
    { title: 'Problem reports', lines: [
      L('Received from agents', n => n.tickets.received),
      L('Marked fixed or closed', n => n.tickets.fixed_or_closed),
    ] },
    { title: 'Regulator cases', lines: [
      L('Cases opened', n => n.cases.opened),
      ...keysOf(c.cases.by_requester, p.cases.by_requester).map(k => L(REQUESTER[k] ?? k, n => n.cases.by_requester?.[k] ?? 0, { sub: true })),
      L('Cases closed', n => n.cases.closed),
      L('Packs and files kept in the vault', n => n.cases.packs),
    ] },
    { title: 'Admin actions', lines: [
      L('Changes made by admins (Master Audit Log)', n => n.admin.actions),
      L('Exports made', n => n.admin.exports),
      ...(c.admin.top_actions ?? []).map(t => ({ label: actionLabel(t.action), cur: t.n, prev: (p.admin.top_actions ?? []).find(x => x.action === t.action)?.n ?? 0, sub: true })),
    ] },
  ];
}
export const actionLabel = (a: string) => a.replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase());

// ---------- months and years ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export function prevMonth(m: string): string {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12-01` : `${y}-${String(mo - 1).padStart(2, '0')}-01`;
}
/** This month first, then back `n` months (not before 2026). */
export function monthOptions(today: string, n = 24): string[] {
  const out: string[] = []; let m = monthStart(today);
  for (let i = 0; i < n && m >= '2026-01-01'; i++) { out.push(m); m = prevMonth(m); }
  return out;
}
/** This year first, back to 2026 (the first year with data). */
export function yearOptions(today: string): number[] {
  const out: number[] = [];
  for (let y = Number(today.slice(0, 4)); y >= 2026; y--) out.push(y);
  return out;
}
export const fmtCount = (n: number | null | undefined) => fmtNum(n ?? 0);
