// AdminBatch011 — plain functions behind the Money screen (no browser needed, unit-tested):
//   * ledger categories, currencies and the checks the entry form runs before saving (the database checks again)
//   * US$ and call-count formats, Google call names in words, alert levels
import { LedgerCategory, LedgerKind, NewLedgerEntry } from '../api/admin';

export const EXPENSE_CATEGORIES: LedgerCategory[] = ['supabase', 'aws', 'google', 'app_stores', 'domain_hosting', 'email_messaging', 'software',
  'legal_compliance', 'marketing', 'staff', 'other_expense'];
export const INCOME_CATEGORIES: LedgerCategory[] = ['developer_partner', 'advertising', 'other_income'];
export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  supabase: 'Supabase (database)', aws: 'AWS (backup)', google: 'Google (Maps, Cloud)', app_stores: 'App stores (Google Play, Apple)',
  domain_hosting: 'Domain & hosting', email_messaging: 'Email & messaging (Resend, WhatsApp)', software: 'Software & tools',
  legal_compliance: 'Legal & compliance', marketing: 'Marketing', staff: 'Staff & contractors', other_expense: 'Other expense',
  developer_partner: 'Developer partners', advertising: 'Advertising', other_income: 'Other income',
};
export const categoryLabel = (c: string) => CATEGORY_LABEL[c as LedgerCategory] ?? c;
export const categoriesFor = (k: LedgerKind) => (k === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);
/** Currencies offered in the form (any 3-letter code is accepted by the database). */
export const CURRENCIES = ['MYR', 'USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CNY'];

/** First day of the month of a YYYY-MM-DD date. */
export const monthOf = (d: string) => `${d.slice(0, 7)}-01`;
/** Add months to a YYYY-MM-01 month. */
export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

/** Problems with a new ledger entry, in plain words (empty = OK to save). */
export function ledgerProblems(f: NewLedgerEntry, today: string): string[] {
  const p: string[] = [];
  if (!f.payee.trim()) p.push(f.kind === 'income' ? 'Write who paid.' : 'Write who was paid.');
  if (!Number.isFinite(f.amount) || f.amount <= 0) p.push('The amount must be more than 0.');
  if (f.amount >= 100_000_000) p.push('The amount is too big.');
  if (!/^[A-Z]{3}$/.test(f.currency)) p.push('Choose a currency.');
  if (f.currency !== 'MYR' && !(Number(f.fx_to_myr) > 0)) p.push(`Write the rate: how many RM for 1 ${f.currency}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.paid_on)) p.push('Choose the date paid.');
  else if (f.paid_on > addDays(today, 31)) p.push('The date paid can be at most a month ahead.');
  if (!categoriesFor(f.kind).includes(f.category)) p.push('Choose a category.');
  return p;
}
export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** The amount in RM the form will save (rounded like the database). */
export const toMyr = (amount: number, currency: string, fx: number | null | undefined) =>
  Math.round(amount * (currency === 'MYR' ? 1 : Number(fx) || 0) * 100) / 100;

/** US$ with cents; "—" when unknown. */
export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `US$ ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** RM with cents for money tables (fmtRm in market.ts drops trailing zeros). */
export function fmtMyr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return `${v < 0 ? '-' : ''}RM ${Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const GOOGLE_NAME_LABEL: Record<string, string> = {
  'maps.map': 'Map shown', 'maps.load': 'Maps script loaded', 'geocoding.reverse': 'Map pin → address', 'geocoding.forward': 'Address → map pin',
  'places.autocomplete': 'Address suggestions', 'places.details': 'Place details', 'directions.route': 'Directions', 'routes.compute': 'Route', 'roads.snap': 'Snap to road',
};
export const googleNameLabel = (n: string) => GOOGLE_NAME_LABEL[n] ?? n;
export const LEVEL_LABEL = { ok: 'OK', amber: 'Watch', red: 'Limit reached' } as const;
export const levelTag = (l: 'ok' | 'amber' | 'red') => (l === 'red' ? 'red' : l === 'amber' ? 'amber' : 'ok');

/** Share of a limit used, 0-100+ (null when there is no limit). */
export const usedPct = (calls: number, limit: number | null | undefined) => (limit ? Math.round((calls / limit) * 100) : null);
