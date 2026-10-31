// AdminBatch010: calls for the other apps' admin data. POS, On Da Way and MM2H live in the Admin EAB database; AI Buddy
// Biz has its own database with the same eab_admin_* function names (see src/api/biz.ts for its sign-in).
// Every function checks the admin's role on the server, writes the access log, and asks for a reason before a change.
import { Call } from './admin';

export type OtherApp = 'pos' | 'odw' | 'mm2h' | 'biz';

export interface AppViewResult {
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  names_hidden: boolean;
  from: string;
  to: string;
}
export interface AppSettings {
  maintenance_on: boolean; maintenance_message: string | null; min_version: string | null; update_url: string | null;
  announcement: string | null; announcement_until: string | null; updated_at?: string;
}
export interface ContentItem {
  title: string; body?: string | null; url?: string | null; area?: string | null; phone?: string | null;
  valid_until?: string | null; status?: string | null; published?: boolean; sort?: number;
}

export const appCalls = (call: Call, device: string) => ({
  view: (app: OtherApp, view: string, opts: { from?: string | null; to?: string | null; q?: string | null; limit?: number } = {}) =>
    call<AppViewResult>('eab_admin_app_view', { p_app: app, p_view: view, p_from: opts.from || null, p_to: opts.to || null,
      p_q: opts.q || null, p_limit: opts.limit ?? 200, p_device: device }),
  setSettings: (app: OtherApp, patch: Partial<AppSettings>, reason: string) =>
    call<AppSettings>('eab_admin_app_settings_set', { p_app: app, p_patch: patch, p_reason: reason, p_device: device }),
  setFlag: (app: OtherApp, key: string, label: string | null, enabled: boolean, reason: string) =>
    call<unknown>('eab_admin_app_flag_set', { p_app: app, p_key: key, p_label: label, p_enabled: enabled, p_reason: reason, p_device: device }),
  setTicket: (id: string, status: 'open' | 'in_progress' | 'closed', reason: string) =>
    call<void>('eab_admin_app_ticket_set', { p_id: id, p_status: status, p_reason: reason, p_device: device }),
  // MM2H only (Admin EAB database)
  setRequest: (id: string, status: 'open' | 'done' | 'refused', reason: string) =>
    call<void>('eab_admin_mm2h_request_set', { p_id: id, p_status: status, p_reason: reason, p_device: device }),
  saveContent: (kind: string, id: string | null, item: ContentItem, reason: string) =>
    call<ContentItem & { id: string }>('eab_admin_mm2h_content_save', { p_kind: kind, p_id: id, p_item: item, p_reason: reason, p_device: device }),
  deleteContent: (kind: string, id: string, reason: string) =>
    call<void>('eab_admin_mm2h_content_delete', { p_kind: kind, p_id: id, p_reason: reason, p_device: device }),
  // AI Buddy Biz only (its own database)
  setModule: (tenant: string, module: string, enabled: boolean, reason: string) =>
    call<unknown>('eab_admin_biz_module_set', { p_tenant: tenant, p_module: module, p_enabled: enabled, p_reason: reason, p_device: device }),
  setBizAdmin: (email: string, role: string, active: boolean, reason: string) =>
    call<unknown>('eab_admin_set_admin', { p_email: email, p_role: role, p_active: active, p_expires_at: null, p_reason: reason, p_device: device }),
  verifyBizLog: () => call<{ ok: boolean; checked: number; first_bad_seq: number | null }>('eab_admin_verify_log', { p_device: device }),
});
export type AppCalls = ReturnType<typeof appCalls>;

/** Views that are not tied to a period (the date range is hidden for them). */
export const NO_PERIOD = new Set(['businesses', 'modules', 'invites', 'inventory', 'customers', 'tax', 'users', 'agents', 'vendors', 'parties',
  'families', 'applications', 'renewals', 'requests', 'tickets', 'flags', 'settings', 'shopsync', 'adminlog', 'admins', 'hr', 'legal', 'crm',
  'shipping', 'overdue']);

/** Plain-words column headings; anything not listed is turned from snake_case into words. */
const HEADINGS: Record<string, string> = {
  rm: 'RM', pct: '%', q: 'Search', tin: 'TIN', sst: 'SST', msic: 'MSIC', ren_no: 'REN no.', rm_total: 'Total (RM)', ai: 'AI',
};
export function heading(key: string): string {
  if (HEADINGS[key]) return HEADINGS[key];
  const words = key.replace(/_rm$/, ' (RM)').replace(/_pct$/, ' (%)').replace(/_usd$/, ' (USD)').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Flattens one row for a table: a nested `record` object becomes its own columns; other objects become short text. */
export function flatRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'record' && v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export function cellText(v: unknown, key = ''): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (/(_rm|^total|^value|price|amount|gross|income|expenses|profit|stock|debit)/.test(key) && !Number.isInteger(v)) return v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toLocaleString('en-MY');
  }
  if (typeof v === 'string') return ISO_TIME.test(v) ? new Date(v).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : v;
  if (Array.isArray(v)) return v.map(x => cellText(x)).join(', ');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${heading(k)}: ${cellText(x, k)}`).join(' · ');
  return String(v);
}

/** Columns for a list: every key that appears in any row, in first-seen order; ids are kept out of sight. */
export function columnsOf(rows: Record<string, unknown>[], hidden: string[] = ['id', 'tenant_id']): string[] {
  const seen: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k) && !hidden.includes(k)) seen.push(k);
  return seen;
}
