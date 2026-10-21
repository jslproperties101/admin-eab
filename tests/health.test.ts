import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, cumulativeFromUploads, daysSince, failRate, fmtBytes, fmtMs, forecast, growthPerDay, levelFor, MB, todayKL } from '../src/admin/health';
import { buildHealthDoc, buildHealthSheets, healthFileName, HealthReportInput, storageForecasts } from '../src/export/health';
import { can, ALL_ROLES } from '../src/admin/roles';
import { DbHealth, StorageHealth } from '../src/api/admin';

test('sizes, times and levels in plain words', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(1536), '1.50 KB');
  assert.equal(fmtBytes(16_971_443), '16.2 MB');
  assert.equal(fmtBytes(500 * MB), '500 MB');
  assert.equal(fmtBytes(null), '—');
  assert.equal(fmtMs(850), '850 ms');
  assert.equal(fmtMs(9584), '9.6 s');
  assert.equal(levelFor(10), 'ok'); assert.equal(levelFor(70), 'amber'); assert.equal(levelFor(95), 'red');
  assert.equal(failRate(0, 0), null);
  assert.equal(failRate(98, 11)?.toFixed(1), '11.2');
});

test('Malaysia date and day arithmetic', () => {
  assert.equal(todayKL(new Date('2026-10-21T16:30:00Z')), '2026-10-22');   // 00:30 in KL
  assert.equal(todayKL(new Date('2026-10-21T15:59:00Z')), '2026-10-21');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysSince('2026-09-15', '2026-10-22'), 37);
  assert.equal(daysSince(null, '2026-10-22'), null);
});

test('growth per day: a straight line, too few readings, and a 90-day window', () => {
  const pts = [0, 1, 2, 3].map(i => ({ day: addDays('2026-10-01', i), bytes: 1000 + i * 500 }));
  assert.equal(Math.round(growthPerDay(pts)!), 500);
  assert.equal(growthPerDay(pts.slice(0, 1)), null);
  assert.equal(growthPerDay([{ day: '2026-10-01', bytes: 1 }, { day: '2026-10-01', bytes: 9 }]), null, 'same day twice is not a trend');
  // an old jump outside the window is ignored
  const old = [{ day: '2026-01-01', bytes: 0 }, ...pts];
  assert.equal(Math.round(growthPerDay(old)!), 500);
});

test('forecast: days left and the date the limit is reached', () => {
  const today = '2026-10-22';
  const pts = [{ day: '2026-10-12', bytes: 100 * MB }, { day: today, bytes: 110 * MB }];   // 1 MB a day
  const f = forecast(110 * MB, 500 * MB, pts, today);
  assert.equal(f.daysLeft, 390);
  assert.equal(f.fullOn, addDays(today, 390));
  assert.match(f.sentence, /full in about 390 days/);
  assert.equal(f.level, 'ok');
  assert.match(forecast(110 * MB, 500 * MB, pts.slice(1), today).sentence, /Not enough daily readings/);
  assert.match(forecast(110 * MB, 500 * MB, [{ day: '2026-10-12', bytes: 120 * MB }, { day: today, bytes: 110 * MB }], today).sentence, /Not growing/);
  const full = forecast(600 * MB, 500 * MB, pts, today);
  assert.equal(full.daysLeft, 0); assert.equal(full.level, 'red');
});

test('stored files: running total from uploads works from day one', () => {
  const c = cumulativeFromUploads([{ day: '2026-10-17', bytes: 10 }, { day: '2026-10-20', bytes: 30 }], 100, '2026-10-22');
  assert.deepEqual(c, [{ day: '2026-10-17', bytes: 70 }, { day: '2026-10-20', bytes: 100 }, { day: '2026-10-22', bytes: 100 }]);
});

test('roles for System Health mirror the database', () => {
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'viewHealth')), ['owner', 'admin', 'compliance', 'viewer']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'viewHealthAgents')), ['owner', 'admin', 'compliance']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'recordBackupTest')), ['owner', 'admin', 'compliance']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'editHealthLimits')), ['owner', 'admin']);
  assert.equal(can('regulator', 'viewHealth'), false);
});

const limits = { db_limit_mb: 500, storage_limit_mb: 1024, aws_backup: 'not_set_up' as const, aws_note: null, updated_at: '2026-10-22T00:00:00Z', updated_by: null };
const test1 = { id: 't1', ref: 'BKT-2026-0001', tested_on: '2026-10-21', target: 'supabase' as const, kind: 'restore_test' as const, result: 'pass' as const,
  what: 'Restored into a scratch project', duration_minutes: 40, notes: 'All 28 listings present', recorded_by: 'me', recorded_by_email: 'joe@example.com', recorded_at: '2026-10-21T10:00:00Z' };
const storage: StorageHealth = {
  checked_at: '2026-10-22T01:00:00Z', today: { day: '2026-10-22', db_bytes: 17 * MB, storage_bytes: 26 * MB, storage_files: 94 },
  buckets: [{ bucket: 'eab-files', files: 90, bytes: 25 * MB, first_at: '2026-10-17T00:00:00Z', last_at: '2026-10-21T00:00:00Z' }],
  uploads: [{ day: '2026-10-17', files: 50, bytes: 10 * MB }, { day: '2026-10-21', files: 44, bytes: 16 * MB }],
  daily: [{ day: '2026-10-22', db_bytes: 17 * MB, storage_bytes: 26 * MB, storage_files: 94 }],
  limits, backup_tests: { count: 1, last: test1, last_restore_pass: test1 },
};
const db: DbHealth = {
  checked_at: '2026-10-22T01:00:00Z', db_bytes: 17 * MB, postgres: '17.11',
  connections: { total: 12, active: 1, idle: 11, idle_in_transaction: 0, max: 60 }, longest_query_s: 0, slow_queries: 0,
  stats: { cache_hit_pct: 99.9, commits: 1000, rollbacks: 3, deadlocks: 0, temp_bytes: 0, since: null },
  tables: [{ name: 'eab_records', total_bytes: 400_000, data_bytes: 200_000, rows: 28, dead_rows: 2, last_vacuum: null, last_analyze: null, seq_scans: 5, index_scans: 95 }],
  limits,
};
const input: HealthReportInput = { reference: 'EAB-20261022-000010', createdAt: '2026-10-22T01:00:00Z', adminEmail: 'joe@example.com',
  companyName: 'JSL Global Trading', today: '2026-10-22', db, storage, tests: [test1] };

test('health report: PDF blocks and Excel sheets carry the reference, the forecasts and every backup test', () => {
  const doc = buildHealthDoc(input);
  const text = JSON.stringify(doc.blocks);
  assert.ok(text.includes('EAB-20261022-000010') && text.includes('BKT-2026-0001') && text.includes('Restored into a scratch project'));
  assert.ok(text.includes('Not set up yet'), 'AWS state shown');
  assert.ok(text.includes('eab_records'));
  assert.match(doc.footer ?? '', /EAB-20261022-000010/);
  const sheets = buildHealthSheets(input);
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'Backup tests', 'Storage by day', 'Buckets', 'Tables']);
  assert.equal(sheets[1].rows.length, 2);
  assert.equal(sheets[1].rows[1][0], 'BKT-2026-0001');
  assert.equal(healthFileName('EAB-1', 'pdf'), 'System-Health-EAB-1.pdf');
  const f = storageForecasts(storage, '2026-10-22');
  assert.equal(f.db.perDay, null, 'one daily reading: no database forecast yet');
  assert.ok(f.files.perDay! > 0, 'files forecast works from upload dates');
});
