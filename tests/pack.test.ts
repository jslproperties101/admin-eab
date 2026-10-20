import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCasePackDoc, buildCasePackSheets, contentFingerprint, inRange, shortFp, stableStringify, AgentBundle } from '../src/export/pack';
import { CaseFile, LoginRow } from '../src/api/admin';

test('content fingerprint ignores key order but not values', async () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: null }] }), '{"a":[2,{"c":null,"d":3}],"b":1}');
  const a = await contentFingerprint({ x: 1, y: 'z' });
  assert.equal(a, await contentFingerprint({ y: 'z', x: 1 }));
  assert.notEqual(a, await contentFingerprint({ x: 2, y: 'z' }));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(shortFp(a).length, 17);
});

const row = (at: string): LoginRow => ({ seq: 1, happened_at: at, received_at: at, event: 'sign_in', device_id: null, device: null, platform: 'android', app_version: null, lat: null, lng: null, acc: null, detail: null });

test('sign-ins are limited to the agent period (Malaysia days, inclusive)', () => {
  const rows = [row('2026-09-30T15:59:00Z'), row('2026-09-30T16:00:00Z'), row('2026-10-20T15:59:59Z'), row('2026-10-20T16:00:00Z')];
  // 2026-10-01 00:00 MYT = 2026-09-30 16:00 UTC ; 2026-10-20 23:59:59 MYT = 2026-10-20 15:59:59 UTC
  assert.deepEqual(inRange(rows, '2026-10-01', '2026-10-20').map(r => r.happened_at), ['2026-09-30T16:00:00Z', '2026-10-20T15:59:59Z']);
  assert.equal(inRange(rows, null, null).length, 4);
});

const kase: CaseFile = { id: 'c1', case_no: 'CASE-2026-0001', requester_type: 'police', requester_name: 'IPD Dang Wangi', requester_ref: 'RPT/77',
  requester_contact: null, received_on: '2026-10-18', deadline: '2026-10-30', description: 'Fraud report', status: 'open', outcome: null,
  created_by: 'x', created_at: '', updated_at: '', closed_at: null, agents: [], packs: [] };
const bundle = (n: number): AgentBundle => ({
  agent: { user_id: `u${n}`, email: `a${n}@x.com`, name: `Agent ${n}`, date_from: '2026-10-01', date_to: null, added_at: '', removed_at: null },
  profile: { user_id: `u${n}`, email: `a${n}@x.com`, name: `Agent ${n}`, joined_at: '2026-10-01T00:00:00Z', last_sign_in_at: null, banned_until: null,
    deleted_at: null, status: 'active', licence: null, workspaces: [], counts: { properties: { total: 1, deleted: 0 } } },
  records: { properties: [{ workspace_id: 'w', collection: 'properties', id: `p${n}`, data: { ref: `P10${n}` }, deleted: false, rev: 1, written_at: null, written_by: null }] },
  histories: {}, loginLog: [row('2026-10-20T06:00:00Z')], termsLog: [],
});

test('case pack: cover with case, period and content fingerprint, then each agent; sheets prefixed per agent', () => {
  const fp = 'f'.repeat(64);
  const doc = buildCasePackDoc(kase, [bundle(1), bundle(2)], 'EAB-1', '2026-10-21T00:00:00Z', 'joe@x.com', fp, 'JSL Global Trading');
  const t = JSON.stringify(doc.blocks);
  assert.ok(t.includes('Regulator request pack') && t.includes('CASE-2026-0001') && t.includes('Polis Diraja Malaysia'));
  assert.ok(t.includes(fp), 'content fingerprint printed');
  assert.ok(t.includes('a1@x.com · period 2026-10-01 to today'));
  assert.ok(t.includes('Agent 1 of 2') && t.includes('Agent 2 of 2') && t.includes('P101') && t.includes('P102'));
  assert.ok(doc.footer!.includes('CASE-2026-0001') && doc.footer!.includes('EAB-1'));
  const sheets = buildCasePackSheets(kase, [bundle(1), bundle(2)], 'EAB-1', '2026-10-21T00:00:00Z', 'joe@x.com', fp);
  assert.equal(sheets[0].name, 'Case');
  assert.ok(sheets.some(s => s.name === 'A1 Listings') && sheets.some(s => s.name === 'A2 Sign-in history'));
  assert.ok(sheets[0].rows.some(r => r[0] === 'Content fingerprint (SHA-256)' && r[1] === fp));
  const one = buildCasePackSheets(kase, [bundle(1)], 'EAB-1', '2026-10-21T00:00:00Z', 'joe@x.com', fp);
  assert.ok(one.some(s => s.name === 'Listings'), 'no prefix with a single agent');
});
