import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTag, complaintProblems, deadlineText, expiryLevel, expiryText, pdpaDeadline, pdpaProblems, TAG_RE } from '../src/admin/compliance';
import { masterAlerts } from '../src/screens/Overview';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';
import { MasterDash } from '../src/api/admin';

test('PDPA: 21 days to answer access / correction requests; none for deletion; none once done', () => {
  const d = pdpaDeadline({ kind: 'access', received_on: '2026-10-01', status: 'open' }, '2026-10-15');
  assert.deepEqual(d, { due: '2026-10-22', daysLeft: 7, level: 'amber' });
  assert.equal(deadlineText(d), '7 days left (due 2026-10-22)');
  assert.equal(pdpaDeadline({ kind: 'correction', received_on: '2026-10-01', status: 'in_progress' }, '2026-10-01')?.level, 'ok');
  const late = pdpaDeadline({ kind: 'access', received_on: '2026-09-01', status: 'open' }, '2026-10-22');
  assert.equal(late?.level, 'red'); assert.equal(deadlineText(late), '30 days late (due 2026-09-22)');
  assert.equal(deadlineText(pdpaDeadline({ kind: 'access', received_on: '2026-10-01', status: 'open' }, '2026-10-22')), 'due today (2026-10-22)');
  assert.equal(pdpaDeadline({ kind: 'deletion', received_on: '2026-09-01', status: 'open' }, '2026-10-22'), null);
  assert.equal(pdpaDeadline({ kind: 'access', received_on: '2026-09-01', status: 'done' }, '2026-10-22'), null);
});

test('licence expiry levels and words', () => {
  assert.equal(expiryLevel(null), 'none'); assert.equal(expiryLevel(-1), 'expired'); assert.equal(expiryLevel(5), 'red');
  assert.equal(expiryLevel(20), 'amber'); assert.equal(expiryLevel(45), 'ok');
  assert.equal(expiryText(-3, '2026-10-19'), 'Expired 3 days ago (2026-10-19)');
  assert.equal(expiryText(1, '2026-10-23'), 'Expires in 1 day (2026-10-23)');
  assert.equal(expiryText(null, null), 'No expiry date');
});

test('form checks and tags', () => {
  assert.deepEqual(pdpaProblems({ requester_name: ' ', received_on: '2026-10-30', kind: 'access', details: '' }, '2026-10-22'),
    ['Who asked? Type the name.', 'The date received cannot be in the future.', 'Write what was asked.']);
  assert.deepEqual(pdpaProblems({ requester_name: 'Siti', received_on: '2026-10-20', kind: 'deletion', details: 'Delete' }, '2026-10-22'), []);
  assert.deepEqual(complaintProblems({ complainant_name: 'B', received_on: 'x', channel: 'phone', category: 'fees', details: 'd' }, '2026-10-22'),
    ['Pick the date the complaint was received.']);
  assert.equal(cleanTag('  VIP   Client '), 'vip client');
  assert.ok(TAG_RE.test('vip')); assert.ok(!TAG_RE.test('bad tag!!')); assert.ok(!TAG_RE.test('x'.repeat(31)));
});

const base: MasterDash = {
  checked_at: '2026-10-22T04:00:00Z', today: '2026-10-22', agents: 6, new_7d: 2, active_today: 2, active_7d: 4, active_30d: 4, at_risk: 0, live_now: 1,
  listings: 9, stale: 0, closed_30d: 1, db_bytes: 1, db_limit_bytes: 100, files_bytes: 1, files_limit_bytes: 100, aws_backup: 'set_up',
  last_restore_pass: '2026-10-20', sync_runs_7d: 0, sync_fails_7d: 0, tickets_new: 0, tickets_open: 0, pushes_waiting: 0, posts_live: 0,
  maintenance_on: false, maintenance_back_at: null, min_version: null, min_version_mode: 'soft', flags_on: 0, licences_unverified: 0,
  accounts_not_active: 0, active_by_day: [],
};
test('master dashboard: licence and PDPA alerts', () => {
  assert.deepEqual(masterAlerts(base, '2026-10-22'), []);
  const a = masterAlerts({ ...base, licences_expired: 1, licences_expiring_30: 2, pdpa_active: 3, pdpa_due_soon: 1, complaints_active: 2 }, '2026-10-22');
  assert.deepEqual(a.filter(x => x.level === 'red').map(x => x.text), ['1 licence expired', '1 PDPA request open 14+ days (21-day rule)']);
  assert.ok(a.some(x => x.text === '2 licences expiring within 30 days' && x.open?.k === 'licences'));
  assert.ok(a.some(x => x.text === '2 complaints open' && x.open?.k === 'complaints'));
  assert.ok(!a.some(x => x.text.startsWith('3 PDPA')), 'only the urgent PDPA line when some are due soon');
});

test('roles mirror the database; tiles open', () => {
  const rule: Record<string, string[]> = {
    pdpa: ['owner', 'compliance'], complaints: ['owner', 'admin', 'compliance'], viewHolds: ['owner', 'admin', 'compliance'],
    placeHold: ['owner', 'compliance'], licences: ['owner', 'admin', 'compliance'], internal: ['owner', 'admin', 'compliance'],
    viewRetention: ['owner', 'compliance'], reviewRetention: ['owner'],
  };
  for (const [ab, roles] of Object.entries(rule)) for (const r of ALL_ROLES) assert.equal(can(r, ab as never), roles.includes(r), `${ab} ${r}`);
  const open = new Set(SECTIONS.flatMap(s => s.items).filter(f => f.open).map(f => String(f.n)));
  for (const n of ['50', '51', '82', '88', '91']) assert.ok(open.has(n), n);
});
