import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_LABEL, EXPENSE_CATEGORIES, INCOME_CATEGORIES, addDays, addMonths, categoriesFor, fmtMyr, fmtUsd, googleNameLabel, ledgerProblems, levelTag,
  monthOf, toMyr, usedPct,
} from '../src/admin/money';
import { buildMoneyDoc, buildMoneySheets, moneyFileName, MoneyReportInput } from '../src/export/money';
import { NewLedgerEntry } from '../src/api/admin';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';

const base = (o: Partial<NewLedgerEntry> = {}): NewLedgerEntry => ({ kind: 'expense', category: 'supabase', payee: 'Supabase Inc', amount: 25, currency: 'MYR',
  fx_to_myr: null, paid_on: '2026-10-30', recurring: false, ...o });

test('ledger form checks: the same rules the database enforces', () => {
  assert.deepEqual(ledgerProblems(base(), '2026-10-30'), []);
  assert.match(ledgerProblems(base({ payee: ' ' }), '2026-10-30').join(), /who was paid/);
  assert.match(ledgerProblems(base({ kind: 'income', category: 'developer_partner', payee: '' }), '2026-10-30').join(), /who paid/);
  assert.match(ledgerProblems(base({ amount: 0 }), '2026-10-30').join(), /more than 0/);
  assert.match(ledgerProblems(base({ currency: 'USD' }), '2026-10-30').join(), /how many RM for 1 USD/);
  assert.deepEqual(ledgerProblems(base({ currency: 'USD', fx_to_myr: 4.5 }), '2026-10-30'), []);
  assert.match(ledgerProblems(base({ paid_on: '2026-12-15' }), '2026-10-30').join(), /at most a month ahead/);
  assert.match(ledgerProblems(base({ kind: 'income', category: 'aws' }), '2026-10-30').join(), /Choose a category/);
});

test('categories: paid and received never mix; every one has words', () => {
  assert.equal(EXPENSE_CATEGORIES.filter(c => INCOME_CATEGORIES.includes(c)).length, 0);
  assert.equal(Object.keys(CATEGORY_LABEL).length, EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length);
  assert.deepEqual(categoriesFor('income'), INCOME_CATEGORIES);
});

test('money, months and Google words', () => {
  assert.equal(toMyr(25, 'USD', 4.5), 112.5); assert.equal(toMyr(120.505, 'MYR', null), 120.51); assert.equal(toMyr(10, 'SGD', null), 0);
  assert.equal(fmtMyr(1234.5), 'RM 1,234.50'); assert.equal(fmtMyr(-50), '-RM 50.00'); assert.equal(fmtMyr(null), '—');
  assert.equal(fmtUsd(0.03), 'US$ 0.03'); assert.equal(fmtUsd(7), 'US$ 7.00'); assert.equal(fmtUsd(undefined), '—');
  assert.equal(monthOf('2026-10-30'), '2026-10-01'); assert.equal(addMonths('2026-01-01', -1), '2025-12-01'); assert.equal(addMonths('2026-11-01', 2), '2027-01-01');
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(googleNameLabel('maps.map'), 'Map shown'); assert.equal(googleNameLabel('new.api'), 'new.api');
  assert.equal(levelTag('red'), 'red'); assert.equal(levelTag('ok'), 'ok');
  assert.equal(usedPct(80, 100), 80); assert.equal(usedPct(5, null), null);
});

test('roles: Money for Owner, Admin, Compliance; only the Owner changes it', () => {
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'viewMoney')).sort(), ['admin', 'compliance', 'owner']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'editMoney')), ['owner']);
});

test('home tiles: Money has no "Coming soon" left — the five open, the subscription ones stay blocked', () => {
  const money = SECTIONS.find(s => s.title === 'Money')!;
  for (const n of [2, 40, 10, 34, 33]) assert.ok(money.items.find(f => f.n === n)?.open, `feature ${n}`);
  assert.ok(money.items.every(f => f.open || f.blocked));
  const left = SECTIONS.flatMap(s => s.items).filter(f => !f.open && !f.blocked);
  assert.deepEqual(left.map(f => f.n), [], 'no "Coming soon" tile anywhere');
});

const input = (): MoneyReportInput => ({
  reference: 'EAB-20261030-000002', createdAt: '2026-10-30T03:00:00Z', adminEmail: 'owner@example.com', companyName: 'JSL Global Trading',
  data: {
    summary: { months: 12, since: '2025-11-01', usd_myr: 4.5, monthly_budget_myr: 100, income: 1000, expenses: 233, net: 767,
      this_month: { income: 1000, expenses: 233, net: 767, active: 2, cost_per_active: 116.5, over_budget: true },
      by_month: [{ month: '2026-10', income: 1000, expenses: 233, net: 767, active: 2, cost_per_active: 116.5, google_usd: 0.03, google_myr: 0.14, google_billed: false, over_budget: true }],
      by_category: [{ kind: 'expense', category: 'supabase', amount_myr: 225, per_active: 112.5 }, { kind: 'income', category: 'developer_partner', amount_myr: 1000, per_active: 500 }],
      average_active: 2, cost_per_active_avg: 116.5 },
    ledger: { from: '2025-10-01', to: '2026-10-30', expenses_myr: 233, income_myr: 1000, voided: 1,
      by_category: [{ kind: 'expense', category: 'supabase', entries: 2, amount_myr: 225 }],
      entries: [
        { id: 'l1', ref: 'LED-2026-0001', kind: 'expense', category: 'supabase', payee: 'Supabase Inc', description: null, amount: 25, currency: 'USD', fx_to_myr: 4.5, amount_myr: 112.5,
          paid_on: '2026-10-05', period_month: '2026-10-01', recurring: true, invoice_ref: 'INV-1', repeat_of: null, repeat_ref: null, voided_at: null, void_reason: null,
          voided_by_email: null, created_by_email: 'owner@example.com', created_at: '2026-10-05T01:00:00Z' },
        { id: 'l2', ref: 'LED-2026-0002', kind: 'expense', category: 'domain_hosting', payee: 'Exabytes', description: null, amount: 120.5, currency: 'MYR', fx_to_myr: 1, amount_myr: 120.5,
          paid_on: '2026-10-01', period_month: '2026-10-01', recurring: false, invoice_ref: null, repeat_of: null, repeat_ref: null, voided_at: '2026-10-02T01:00:00Z',
          void_reason: 'Entered twice', voided_by_email: 'owner@example.com', created_by_email: 'owner@example.com', created_at: '2026-10-01T01:00:00Z' }] },
    usage: { months: 12, since: '2025-11-01', this_month: '2026-10-01', days_in_month: 31, days_passed: 30, usd_myr: 4.5, alerts: 1,
      month_usd: 0.03, projected_usd: 0.03, month_myr: 0.14, projected_myr: 0.14, unpriced_calls: 1,
      products: [{ sku: 'dynamic_maps', label: 'Dynamic Maps (each map shown)', names: ['maps.map'], price_per_1000: 7, free_per_month: 5, monthly_limit: null, daily_limit: null,
        alert_pct: 80, month_calls: 9, today_calls: 9, projected: 9, level: 'amber', reasons: ['free allowance used up: now paid'],
        month_usd: 0.03, projected_usd: 0.03, month_myr: 0.14, projected_myr: 0.14 }],
      by_month: [{ month: '2026-10', calls: 10, failures: 1, usd: 0.03, myr: 0.14 }], by_month_sku: [], by_name: [{ name: 'maps.map', sku: 'dynamic_maps', calls: 9, failures: 0, agents: 1 }],
      by_day: [], top_agents: [] },
  },
});

test('money report: PDF blocks and Excel sheets; voided entries marked, not hidden', () => {
  const text = JSON.stringify(buildMoneyDoc(input()));
  for (const h of ['Profit & loss', 'Cost per active agent', 'Billing & expenses (ledger)', 'Google API']) assert.ok(text.includes(h), h);
  assert.ok(text.includes('RM 767.00') && text.includes('VOID: Entered twice') && text.includes('USD 25 at 4.5') && text.includes('free allowance used up'));
  const sheets = buildMoneySheets(input());
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'By month', 'Ledger', 'Google API']);
  assert.equal(sheets[2].rows.length, 3);
  assert.match(String(sheets[2].rows[2][13]), /Entered twice/);
  for (const s of sheets) for (const r of s.rows) assert.ok(r.length <= s.widths!.length, `${s.name}: row wider than its columns`);
  assert.equal(moneyFileName('EAB-1', 'pdf'), 'Money-EAB-1.pdf');
});
