import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketFor, bucketLabel, cmpVersionDesc, fmtPct0, heatGrid, languageLabel, nameLabel, pctOf, presetRange, rangeDays, rangeProblem,
  sortStatuses, statusLabel,
} from '../src/admin/dash';
import { buildDashDoc, buildDashSheets, dashFileName, DashReportInput } from '../src/export/dash';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';

test('date filter: presets end today and count both ends; custom ranges are checked', () => {
  assert.deepEqual(presetRange('7', '2026-10-22'), { key: '7', from: '2026-10-16', to: '2026-10-22' });
  assert.deepEqual(presetRange('30', '2026-10-22'), { key: '30', from: '2026-09-23', to: '2026-10-22' });
  assert.equal(presetRange('365', '2026-10-22').from, '2025-10-23');
  assert.equal(rangeDays({ from: '2026-10-16', to: '2026-10-22' }), 7);
  assert.equal(rangeProblem('2026-10-01', '2026-10-22', '2026-10-22'), null);
  assert.equal(rangeProblem('2026-10-23', '2026-10-22', '2026-10-22'), 'The start date is after the end date.');
  assert.equal(rangeProblem('2026-10-01', '2026-10-30', '2026-10-22'), 'The end date is in the future.');
  assert.equal(rangeProblem('2024-01-01', '2026-10-22', '2026-10-22'), 'Pick at most 2 years.');
  assert.equal(rangeProblem('', '2026-10-22', '2026-10-22'), 'Pick both dates.');
  // 731 days is the most the database accepts (p_to - p_from <= 730)
  assert.equal(rangeProblem('2024-10-21', '2026-10-21', '2026-10-22'), null);
  assert.equal(rangeProblem('2024-10-20', '2026-10-21', '2026-10-22'), 'Pick at most 2 years.');
});

test('chart buckets: days up to 2 months, then weeks, then months', () => {
  assert.equal(bucketFor(7), 'day'); assert.equal(bucketFor(62), 'day');
  assert.equal(bucketFor(90), 'week'); assert.equal(bucketFor(365), 'month');
  assert.equal(bucketLabel('2026-10-01', 'month'), '2026-10');
  assert.equal(bucketLabel('2026-10-19', 'week'), 'wk of 2026-10-19');
});

test('versions newest first, numbers compared as numbers', () => {
  const v = ['2.9.0', '?', '2.10.0', '2.2.0', '2.9.1', '1.0'].sort(cmpVersionDesc);
  assert.deepEqual(v, ['2.10.0', '2.9.1', '2.9.0', '2.2.0', '1.0', '?']);
});

test('listing statuses use the main app words, each Booked stage separately, in pipeline order', () => {
  assert.equal(statusLabel('rented_pending_ta'), 'Rented - Pending TA Signing');
  assert.equal(statusLabel('booked_pending_loan'), 'Booked - Pending Loan');
  assert.equal(statusLabel('off_market'), 'Withdrawn');
  const s = sortStatuses({ sold: 2, available: 5, rented_pending_ta: 1, booked_spa_signed: 1, mystery: 1, rented: 0 });
  assert.deepEqual(s.map(x => x.key), ['available', 'booked_spa_signed', 'sold', 'rented_pending_ta', 'mystery']);
});

test('plain words for screens, features and languages', () => {
  assert.equal(nameLabel('listing-form'), 'Add / edit listing');
  assert.equal(nameLabel('geocoding.reverse'), 'Google: place name lookup');
  assert.equal(nameLabel('lang.ms'), 'Language: Bahasa Melayu');
  assert.equal(nameLabel('brand-new-screen'), 'brand-new-screen');
  assert.equal(languageLabel('zh'), 'Chinese');
  assert.equal(fmtPct0(pctOf(1, 3)), '33%'); assert.equal(fmtPct0(pctOf(1, 0)), '—');
});

test('heatmap grid: Monday first, ignores bad cells, reports the busiest', () => {
  const { grid, max } = heatGrid([{ dow: 1, hour: 9, events: 4 }, { dow: 7, hour: 23, events: 9 }, { dow: 8, hour: 1, events: 50 }, { dow: 1, hour: 9, events: 1 }]);
  assert.equal(grid.length, 7); assert.equal(grid[0].length, 24);
  assert.equal(grid[0][9], 5); assert.equal(grid[6][23], 9); assert.equal(max, 9);
});

test('roles: dashboards for everyone except a regulator; agent lists for owner, admin, compliance', () => {
  for (const r of ALL_ROLES) {
    assert.equal(can(r, 'viewDash'), r !== 'regulator', r);
    assert.equal(can(r, 'viewDashAgents'), ['owner', 'admin', 'compliance'].includes(r), r);
  }
  const open = SECTIONS.flatMap(s => s.items).filter(f => f.open && f.open.k === 'dash').map(f => f.n).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(open, [6, 7, 20, 23, 24, 25, 26, 27, 29, 59, 62]);
});

function input(): DashReportInput {
  return {
    reference: 'EAB-20261022-000009', createdAt: '2026-10-22T04:00:00Z', adminEmail: 'joe@example.com', companyName: 'JSL Global Trading',
    from: '2026-09-23', to: '2026-10-22',
    data: {
      growth: { from: '2026-09-23', to: '2026-10-22', bucket: 'day', total: 6, before: 0, new: 6, buckets: [{ start: '2026-10-17', new: 2, running: 2 }, { start: '2026-10-18', new: 4, running: 6 }] },
      active: { from: '2026-09-23', to: '2026-10-22', agents: 6, active_in_range: 4, avg_dau: 1.2, avg_wau: 2, avg_mau: 3, stickiness_pct: 40, last: { day: '2026-10-22', dau: 1, wau: 3, mau: 4 }, by_day: [{ day: '2026-10-22', dau: 1, wau: 3, mau: 4 }] },
      retention: { from: '2026-09-23', to: '2026-10-22', joined: 6, names_hidden: false,
        retention: [{ days: 7, eligible: 2, kept: 1, pct: 50 }, { days: 30, eligible: 0, kept: 0, pct: null }, { days: 90, eligible: 0, kept: 0, pct: null }],
        cohorts: [{ month: '2026-10-01', joined: 6, kept7: 1, eligible7: 2, kept30: 0, eligible30: 0, kept90: 0, eligible90: 0 }],
        at_risk: { count: 1, agents: [{ user_id: 'a1', email: 'siti@example.com', name: 'Siti Agent', last_day: '2026-10-05', days_since: 17, recent_days: 0, prior_days: 3, reason: 'no_activity_14d' }] } },
      inactive: { days: 30, checked_at: '2026-10-22T04:00:00Z', agents: 6, counts: { '30': 1, '60': 0, '90': 0 }, never_opened: 2, names_hidden: false,
        list: [{ user_id: 'a2', email: 'old@example.com', name: null, joined: '2026-08-01', last_open: null, last_sign_in: '2026-09-01', last_seen: '2026-09-01', days_since: 51, app_version: null, platform: null, status: 'suspended' }] },
      devices: { from: '2026-09-23', to: '2026-10-22', agents: 4, versions: [{ app_version: '2.2.0', agents: 3, last_seen: '2026-10-22T03:00:00Z' }, { app_version: '2.10.0', agents: 1, last_seen: '2026-10-22T03:00:00Z' }],
        platforms: [{ platform: 'android', agents: 3 }, { platform: 'web', agents: 1 }], devices: [{ device: 'SM-S918B', platform: 'android', agents: 2 }],
        languages: [{ language: 'en', agents: 3 }, { language: 'unknown', agents: 1 }], language_events: { en: 5 }, version_agents: null },
      listings: { from: '2025-10-23', to: '2026-10-22', stale_days: 60, checked_at: '2026-10-22T04:00:00Z', total: 9, deleted: 1, agents_with_listings: 3,
        by_status: { available: 4, booked_pending_loan: 1, rented_pending_ta: 1, sold: 1, none: 2 }, by_purpose: { sale: 6, none: 3 },
        by_type: [{ type: 'Terrace house', listings: 4 }], by_state: [{ state: 'Selangor', listings: 5 }], new_by_month: [{ month: '2026-10-01', new: 9 }],
        pipeline: { sale: [{ stage: 'booked', listings: 0, parts: { booked: 0 } }, { stage: 'booked_pending_loan', listings: 1 }, { stage: 'booked_spa_signed', listings: 0 }, { stage: 'sold', listings: 1 }],
          rent: [{ stage: 'rented_pending_ta', listings: 1 }, { stage: 'rented', listings: 0 }] },
        stale_count: 1, names_hidden: false,
        stale: [{ user_id: 'a1', email: 'siti@example.com', name: 'Siti Agent', id: 'p1', ref: 'P1001', headline: 'Corner terrace', type: 'Terrace house', state: 'Selangor', city: 'Shah Alam', updated_at: '2026-07-01T00:00:00Z', days: 113 }] },
      usage: { from: '2026-09-23', to: '2026-10-22', detail_from: '2026-10-18',
        ranking: [{ kind: 'screen', name: 'home', events: 234, agents: 4, failures: 0 }, { kind: 'feature', name: 'properties.create', events: 4, agents: 2, failures: 0 }, { kind: 'sync', name: 'sync.run', events: 105, agents: 3, failures: 3 }],
        not_used: [{ kind: 'screen', name: 'dev-dashboard' }], heatmap: [{ dow: 3, hour: 10, events: 12 }], by_day: [{ day: '2026-10-22', events: 50, agents: 2 }] },
    },
  };
}

test('report: every section, the reference, the period, named agents and stale listings', () => {
  const doc = buildDashDoc(input());
  const text = JSON.stringify(doc.blocks);
  for (const s of ['Sign-ups & growth', 'Active users', 'Retention & churn', 'Inactive agents', 'App versions, phones and language', 'Listings', 'Deal pipeline', 'Feature usage (top 30)'])
    assert.ok(text.includes(s), s);
  assert.ok(text.includes('EAB-20261022-000009'));
  assert.ok(text.includes('2026-09-23 to 2026-10-22 (30 days'));
  assert.ok(text.includes('Siti Agent (siti@example.com)'));
  assert.ok(text.includes('Rented - Pending TA Signing'));
  assert.ok(text.includes('Booked 0 > Pending loan 1 > SPA signed 0 > Sold 1'));
  assert.ok(text.includes('Rented - Pending TA Signing 1 > Rented 0'));
  assert.ok(text.includes('Screen: Home'));
  assert.ok(!text.includes('sync.run'), 'feature usage section lists screens and features only');
  assert.ok(text.indexOf('Version 2.10.0') < text.indexOf('Version 2.2.0'), 'newest version first');
  assert.match(doc.footer ?? '', /EAB-20261022-000009/);
  assert.equal(dashFileName('EAB-1', 'pdf'), 'Dashboards-EAB-1.pdf');
});

test('report sheets: summary, lists and the pipeline in Excel', () => {
  const sheets = buildDashSheets(input());
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'Growth', 'Active by day', 'Retention', 'At risk', 'Inactive', 'Versions & phones', 'Listings', 'Stale listings', 'Feature usage']);
  const get = (n: string) => sheets.find(s => s.name === n)!.rows;
  assert.deepEqual(get('Summary')[0], ['Dashboards report', 'EAB-20261022-000009']);
  assert.deepEqual(get('At risk')[1], ['siti@example.com', 'Siti Agent', '2026-10-05', 17, 0, 3, 'Nothing for 14+ days']);
  assert.equal(get('Inactive')[1][8], 'suspended');
  assert.deepEqual(get('Stale listings')[1].slice(0, 2), ['P1001', 'Corner terrace']);
  assert.ok(get('Listings').some(r => r[0] === 'Pending loan' && r[1] === 1));
  assert.ok(get('Feature usage').some(r => r[1] === 'Sync' && r[4] === 3), 'Excel keeps every kind, including sync failures');
});
