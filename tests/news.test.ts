import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_FILTER_FORM, describeFilters, draftProblems, filterProblems, filtersToForm, flagKey, formToFilters, fromLocalInput, mediaPath,
  mergeOrder, moveTo, placeAt, pushLine, sortGroups, toLocalInput,
} from '../src/admin/news';
import { masterAlerts } from '../src/screens/Overview';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';
import { MasterDash } from '../src/api/admin';
import { MEDIA_PATH } from '../src/api/session';

test('post checks: English title, https links, banner or pop-up, groups, codes only for projects, end date', () => {
  const now = new Date('2026-10-22T04:00:00Z');
  assert.deepEqual(draftProblems({ kind: 'news', title_en: 'OPR cut', audience: 'all' }, now), []);
  assert.ok(draftProblems({ kind: 'news', title_en: ' ', audience: 'all' }, now)[0].startsWith('The English title is needed'));
  assert.ok(draftProblems({ kind: 'news', title_en: 'x', link_url: 'http://x.com' }, now).includes('The website link must start with https://'));
  assert.ok(draftProblems({ kind: 'announcement', title_en: 'x', display: null }, now).includes('Choose banner or pop-up.'));
  assert.ok(draftProblems({ kind: 'news', title_en: 'x', audience: 'groups', group_ids: [] }, now).includes('Choose at least one audience group.'));
  assert.ok(draftProblems({ kind: 'news', title_en: 'x', audience: 'codes' }, now).includes('Invitation codes are for Projects only.'));
  assert.deepEqual(draftProblems({ kind: 'project', title_en: 'x', audience: 'codes' }, now), []);
  assert.ok(draftProblems({ kind: 'news', title_en: 'x', expires_at: '2026-10-21T00:00:00Z' }, now).includes('The end date is already past.'));
});

test('upload names: <year>/<id>.<ext>, pictures or PDF only, 10 MB at most — and the storage rule accepts them', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e', now = new Date('2026-10-22T04:00:00Z');
  const p = mediaPath({ type: 'image/png', size: 2_000_000 }, 'image', id, now);
  assert.deepEqual(p, { path: `2026/${id}.png` });
  assert.ok('path' in p && MEDIA_PATH.test(p.path));
  assert.deepEqual(mediaPath({ type: 'application/pdf', size: 10 }, 'pdf', id, now), { path: `2026/${id}.pdf` });
  assert.deepEqual(mediaPath({ type: 'application/pdf', size: 10 }, 'image', id, now), { error: 'Choose a JPG, PNG or WEBP picture.' });
  assert.deepEqual(mediaPath({ type: 'image/gif', size: 10 }, 'image', id, now), { error: 'Choose a JPG, PNG or WEBP picture.' });
  assert.deepEqual(mediaPath({ type: 'image/jpeg', size: 11 * 1024 * 1024 }, 'image', id, now), { error: 'The file is larger than 10 MB.' });
  assert.ok(!MEDIA_PATH.test('2026/../evil.jpg'));
});

test('order: drag (move), type a position, and the saved order merged with new items', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(placeAt(['a', 'b', 'c'], 0, '3'), ['b', 'c', 'a']);
  assert.deepEqual(placeAt(['a', 'b', 'c'], 2, '1'), ['c', 'a', 'b']);
  assert.deepEqual(placeAt(['a', 'b', 'c'], 0, '99'), ['b', 'c', 'a'], 'past the end = last');
  assert.equal(placeAt(['a', 'b'], 0, '0'), null); assert.equal(placeAt(['a', 'b'], 0, '1.5'), null); assert.equal(placeAt(['a', 'b'], 0, 'x'), null);
  const items = [{ id: 'old', created_at: '2026-10-01' }, { id: 'new', created_at: '2026-10-20' }, { id: 'mid', created_at: '2026-10-10' }];
  assert.deepEqual(mergeOrder([{ item_id: 'old', position: 1 }, { item_id: 'gone', position: 2 }], items), ['old', 'new', 'mid']);
});

test('audience filters: form → filters (Malaysia dates, lower-case emails) and back; plain words; checks', () => {
  const f = formToFilters({ ...EMPTY_FILTER_FORM, emails: 'Siti@Example.com, joe@example.com;joe@example.com', languages: ['bm'], licence_types: ['REN'],
    joined_from: '2026-10-01', last_login_to: '2026-10-21', min_logins: '3', app_versions: '2.2.0 2.1.0' });
  assert.deepEqual(f, { emails: ['siti@example.com', 'joe@example.com'], licence_types: ['REN'], languages: ['bm'], app_versions: ['2.2.0', '2.1.0'],
    joined_from: '2026-10-01T00:00:00+08:00', last_login_to: '2026-10-21T23:59:59+08:00', min_logins: 3 });
  assert.deepEqual(formToFilters(EMPTY_FILTER_FORM), {});
  const back = filtersToForm(f);
  assert.equal(back.joined_from, '2026-10-01'); assert.equal(back.min_logins, '3'); assert.equal(back.emails, 'siti@example.com, joe@example.com');
  assert.equal(describeFilters({}), 'Every agent');
  assert.equal(describeFilters(f), '2 emails · Licence: REN · Language: Bahasa Melayu · Version: 2.2.0, 2.1.0 · Joined from 2026-10-01 · Last sign-in to 2026-10-21 · At least 3 sign-ins');
  assert.deepEqual(filterProblems({ ...EMPTY_FILTER_FORM, emails: 'not-an-email', app_versions: 'v2', min_logins: '-1' }),
    ['Not an email address: not-an-email', 'App versions look like 2.2.0', 'Number of sign-ins must be a whole number.']);
  const g = (id: string, priority: number, at: string) => ({ id, name: id, filters: {}, priority, active: true, created_at: at, updated_at: at });
  assert.deepEqual(sortGroups([g('everyone', 1000, '2026-01-01'), g('b', 5, '2026-02-01'), g('a', 5, '2026-01-15'), g('top', 1, '2026-03-01')]).map(x => x.id), ['top', 'a', 'b', 'everyone']);
});

test('flags, times and push wording', () => {
  assert.equal(flagKey('House Shopping v2'), 'house_shopping_v2');
  assert.equal(flagKey('  AI  command!! '), 'ai_command');
  assert.equal(flagKey('!'), '');
  assert.equal(toLocalInput('2026-10-22T04:30:00Z'), '2026-10-22T12:30');
  assert.equal(fromLocalInput('2026-10-22T12:30'), '2026-10-22T04:30:00.000Z');
  assert.equal(fromLocalInput(''), null);
  assert.equal(pushLine({ targeted: 6, sent: 4, failed: 1, no_phone: 1, delivered: 2, opened: 1 }),
    '4 sent of 6 · at least 2 delivered · 1 opened · 1 failed · 1 without a phone');
});

const master = (p: Partial<MasterDash> = {}): MasterDash => ({
  checked_at: '2026-10-22T04:00:00Z', today: '2026-10-22', agents: 6, new_7d: 2, active_today: 2, active_7d: 4, active_30d: 4, at_risk: 0, live_now: 1,
  listings: 9, stale: 0, closed_30d: 1, db_bytes: 17 * 1048576, db_limit_bytes: 500 * 1048576, files_bytes: 26 * 1048576, files_limit_bytes: 1024 * 1048576,
  aws_backup: 'set_up', last_restore_pass: '2026-10-20', sync_runs_7d: 100, sync_fails_7d: 1, tickets_new: 0, tickets_open: 0, pushes_waiting: 0,
  posts_live: 1, maintenance_on: false, maintenance_back_at: null, min_version: null, min_version_mode: 'soft', flags_on: 0, licences_unverified: 0,
  accounts_not_active: 0, active_by_day: [], ...p,
});

test('master dashboard alerts: none when healthy; red first; each opens the screen behind it', () => {
  assert.deepEqual(masterAlerts(master(), '2026-10-22'), []);
  const a = masterAlerts(master({ maintenance_on: true, db_bytes: 480 * 1048576, last_restore_pass: null, aws_backup: 'not_set_up', sync_fails_7d: 30,
    tickets_new: 2, pushes_waiting: 1, min_version: '2.2.0', min_version_mode: 'hard', stale: 3, at_risk: 1, licences_unverified: 1 }), '2026-10-22');
  assert.deepEqual(a.filter(x => x.level === 'red').map(x => x.text), [
    'Maintenance mode is ON — agents cannot use the app', 'Database 96% full', 'No backup restore test has been recorded', '30 sync failures in 7 days (30%)']);
  assert.equal(a[0].level, 'red'); assert.equal(a[a.length - 1].level, 'amber');
  assert.ok(a.some(x => x.text === '2 new problem reports' && x.open?.k === 'tickets'));
  assert.ok(a.some(x => x.text === '1 push alert waiting to be sent'));
  assert.ok(masterAlerts(master({ last_restore_pass: '2026-09-01' }), '2026-10-22').some(x => x.text === 'Last passed restore test was 51 days ago'));
});

test('roles mirror the database; home tiles for the new features', () => {
  const rule: Record<string, string[]> = {
    viewContent: ['owner', 'admin', 'compliance', 'viewer'], editContent: ['owner', 'admin'], viewTickets: ['owner', 'admin', 'compliance'],
    editTickets: ['owner', 'admin'], viewOps: ['owner', 'admin', 'compliance', 'viewer'], editOps: ['owner', 'admin'],
  };
  for (const [ab, roles] of Object.entries(rule)) for (const r of ALL_ROLES) assert.equal(can(r, ab as never), roles.includes(r), `${ab} ${r}`);
  const open = new Set(SECTIONS.flatMap(s => s.items).filter(f => f.open).map(f => String(f.n)));
  for (const n of ['71', 'N', 'P', '63', 'G', '15', '65', '66', '68', '67', '22', '58']) assert.ok(open.has(n), n);
});
