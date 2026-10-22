// AdminBatch008: broadcast, report, workspace and to-do helpers; roles and home tiles for the new features.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsLine, draftProblem, monthGrid, myDay, myTime, myToday, overdue, showPhone, sortTasks, textFor, waLink } from '../src/admin/comms';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';

const b = { subject_en: 'Office closed', subject_bm: 'Pejabat tutup', subject_zh: null, body_en: 'Closed on Friday', body_bm: '', body_zh: '周五关闭' };

test('B8-1 the agent’s language, English when that version is empty', () => {
  assert.deepEqual(textFor(b, 'bm'), { subject: 'Pejabat tutup', body: 'Closed on Friday' });
  assert.deepEqual(textFor(b, 'zh'), { subject: 'Office closed', body: '周五关闭' });
  assert.deepEqual(textFor(b, 'en'), { subject: 'Office closed', body: 'Closed on Friday' });
});

test('B8-2 tap-to-send link and phone display', () => {
  assert.equal(waLink('60123456789', 'Hi & bye\nnext'), 'https://wa.me/60123456789?text=Hi%20%26%20bye%0Anext');
  assert.equal(waLink('+60 12-345 6789', 'x'), 'https://wa.me/60123456789?text=x');
  assert.equal(showPhone('60123456789'), '+60 12-345 6789');
  assert.equal(showPhone('6591234567'), '+6591234567');
  assert.equal(showPhone(null), '');
});

test('B8-3 counts line and what a draft still needs', () => {
  assert.equal(countsLine({ sent: 12, failed: 1, skipped_no_consent: 2, skipped_no_address: 1, pending: 4 }), '12 sent · 1 failed · 3 skipped · 4 waiting');
  assert.equal(countsLine({}), 'Nobody yet');
  assert.equal(countsLine({ opened_wa: 2, cancelled: 3 }), '2 opened in WhatsApp · 3 not sent (cancelled)');
  const d = { channel: 'email' as const, subject_en: 'S', body_en: 'B', audience: 'all' as const, group_ids: [] };
  assert.equal(draftProblem(d), null);
  assert.match(draftProblem({ ...d, subject_en: ' ' }) ?? '', /subject/);
  assert.equal(draftProblem({ ...d, channel: 'whatsapp', subject_en: '' }), null, 'WhatsApp needs no subject');
  assert.match(draftProblem({ ...d, body_en: '' }) ?? '', /English text/);
  assert.match(draftProblem({ ...d, audience: 'groups' }) ?? '', /group/);
});

test('B8-4 calendar grid starts on Monday; Malaysia-time days and times', () => {
  const g = monthGrid(2026, 9);   // October 2026 starts on a Thursday
  assert.equal(g.length, 42);
  assert.equal(g[0], '2026-09-28'); assert.equal(g[3], '2026-10-01'); assert.equal(g[41], '2026-11-08');
  assert.equal(myDay('2026-10-22T17:30:00Z'), '2026-10-23', 'after 16:00 UTC it is the next day in Malaysia');
  assert.equal(myTime('2026-10-22T01:00:00Z'), '09:00');
  assert.equal(myToday(Date.parse('2026-10-22T20:00:00Z')), '2026-10-23');
});

test('B8-5 tasks: not done first, then by due date; late only when not done and before today', () => {
  const t = (id: string, done: boolean, due: string | null, at = '2026-10-01') => ({ id, done, due_on: due, created_at: at });
  assert.deepEqual(sortTasks([t('a', true, '2026-10-01'), t('b', false, null), t('c', false, '2026-10-30'), t('d', false, '2026-10-20')]).map(x => x.id), ['d', 'c', 'b', 'a']);
  assert.equal(overdue(t('x', false, '2026-10-21'), '2026-10-22'), true);
  assert.equal(overdue(t('x', true, '2026-10-21'), '2026-10-22'), false);
  assert.equal(overdue(t('x', false, null), '2026-10-22'), false);
});

test('B8-6 roles match the database rules', () => {
  const who = (a: Parameters<typeof can>[1]) => ALL_ROLES.filter(r => can(r, a));
  assert.deepEqual(who('viewBroadcasts'), ['owner', 'admin', 'compliance', 'viewer']);
  assert.deepEqual(who('broadcastNames'), ['owner', 'admin', 'compliance']);
  assert.deepEqual(who('editBroadcasts'), ['owner', 'admin']);
  assert.deepEqual(who('reports'), ['owner', 'compliance']);
  assert.deepEqual(who('reportSchedule'), ['owner']);
  assert.deepEqual(who('workspaces'), ['owner', 'admin', 'compliance']);
  assert.deepEqual(who('todo'), ['owner', 'admin', 'compliance', 'viewer']);
});

test('B8-7 the four features are open on Home; To-Do & Calendar asks first', () => {
  const all = SECTIONS.flatMap(s => s.items);
  for (const n of [64, 69, 70, 13]) assert.ok(all.find(f => f.n === n)?.open, `feature ${n} open`);
  assert.equal(all.find(f => f.n === 13)?.choose, true);
});
