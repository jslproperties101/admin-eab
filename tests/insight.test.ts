import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BULK_MAX, bulkProblems, deviceState, funnelRows, scoreLevel, FUNNEL_LABEL } from '../src/admin/insight';
import { draftProblem } from '../src/admin/comms';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';
import { Funnel } from '../src/api/admin';

test('score colours', () => {
  assert.deepEqual([scoreLevel(0), scoreLevel(39), scoreLevel(40), scoreLevel(69), scoreLevel(70), scoreLevel(100)], ['red', 'red', 'amber', 'amber', 'ok', 'ok']);
});

test('funnel: share of all and of the step before; who stopped', () => {
  const f: Funnel = { from: '2026-10-01', to: '2026-10-23', names_hidden: false, steps: [
    { step: 1, key: 'signed_up', agents: 10 }, { step: 2, key: 'opened', agents: 8 }, { step: 3, key: 'terms', agents: 8 }, { step: 4, key: 'licence', agents: 5 },
    { step: 5, key: 'verified', agents: 3 }, { step: 6, key: 'listing', agents: 0 }, { step: 7, key: 'deal', agents: 0 }] };
  const r = funnelRows(f);
  assert.deepEqual(r.map(x => [x.ofAll, x.ofPrev, x.lost]), [[100, null, 0], [80, 80, 2], [80, 100, 0], [50, 63, 3], [30, 60, 2], [0, 0, 3], [0, null, 0]]);
  assert.equal(r[6].label, FUNNEL_LABEL.deal);
  const empty = funnelRows({ ...f, steps: f.steps.map(s => ({ ...s, agents: 0 })) });
  assert.equal(empty[0].ofAll, null);
});

test('bulk checks: action, count, reason, tag', () => {
  assert.deepEqual(bulkProblems('', 0, '', ''), ['Choose what to do.', 'Tick at least one agent.']);
  assert.deepEqual(bulkProblems('suspend', 2, 'Fake documents', ''), []);
  assert.ok(bulkProblems('suspend', 2, 'abc', '')[0].startsWith('Write the reason'));
  assert.ok(bulkProblems('sign_out', BULK_MAX + 1, 'Long enough', '').includes('At most 50 agents at a time.'));
  assert.deepEqual(bulkProblems('message', 3, '', ''), [], 'a message needs no reason here (the broadcast asks for one)');
  assert.ok(bulkProblems('tag_add', 1, 'Long enough', 'Bad Tag!!').some(p => p.startsWith('A tag is')));
  assert.deepEqual(bulkProblems('tag_add', 1, 'Long enough', '  VIP '), []);
});

test('devices: removed, removed but signed in again, in use', () => {
  assert.equal(deviceState({ removed: null, signed_in_after_removal: false }).text, 'In use');
  assert.equal(deviceState({ removed: { at: 'x', by: null, reason: 'r' }, signed_in_after_removal: false }).level, 'red');
  assert.equal(deviceState({ removed: { at: 'x', by: null, reason: 'r' }, signed_in_after_removal: true }).level, 'amber');
});

test('a broadcast for chosen agents needs at least one agent', () => {
  assert.match(draftProblem({ channel: 'whatsapp', body_en: 'Hi', audience: 'agents', group_ids: [], user_ids: [] }) ?? '', /No agents chosen/);
  assert.equal(draftProblem({ channel: 'whatsapp', body_en: 'Hi', audience: 'agents', group_ids: [], user_ids: ['a'] }), null);
});

test('roles mirror the database; insight tiles open', () => {
  const rule: Record<string, string[]> = {
    scorecard: ['owner', 'admin', 'compliance', 'viewer'], funnel: ['owner', 'admin', 'compliance', 'viewer'], bulkActions: ['owner', 'admin'],
    duplicates: ['owner', 'admin', 'compliance'], viewDevices: ['owner', 'admin', 'compliance', 'regulator'], removeDevice: ['owner', 'admin'],
  };
  for (const [ab, roles] of Object.entries(rule)) for (const r of ALL_ROLES) assert.equal(can(r, ab as never), roles.includes(r), `${ab} ${r}`);
  const open = new Set(SECTIONS.flatMap(s => s.items).filter(f => f.open).map(f => String(f.n)));
  for (const n of ['92', '93', '95', '97', '98']) assert.ok(open.has(n), n);
});
