import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, adminName, appsFor, buildApp } from '../src/apps';
import { can } from '../src/admin/roles';

test('builds: unknown or missing EAB_APP stays the original Admin EAB', () => {
  assert.equal(buildApp(undefined), 'eab');
  assert.equal(buildApp('nonsense'), 'eab');
  assert.equal(buildApp(' POS '), 'pos');
  assert.equal(buildApp('all'), 'all');
  assert.equal(adminName('eab'), 'Admin EAB');
  assert.equal(adminName('all'), 'Admin AI Buddy');
  assert.deepEqual(appsFor('all').map(a => a.id), ['eab', 'pos', 'mm2h', 'odw', 'biz']);
  assert.deepEqual(appsFor('biz').map(a => a.id), ['biz']);
});

test('every app has its own Android package, separate from the products', () => {
  const ids = APPS.map(a => a.androidId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('com.jslproperties.malaysiawelcome'));
  assert.equal(APPS.find(a => a.id === 'eab')!.androidId, 'com.jslproperties.admineab', 'existing Admin EAB package unchanged');
});

test('every non-EAB app has the shared logs and roles; features not built yet say why', () => {
  for (const a of APPS) {
    const items = a.sections.flatMap(s => s.items);
    const keys = items.map(f => `${f.n}`);
    assert.equal(new Set(keys).size, keys.length, `${a.id}: tile numbers unique`);
    if (a.id === 'eab') continue;
    for (const n of ['17', '18', '73', '74']) assert.ok(keys.includes(n), `${a.id} has ${n}`);
    for (const f of items) assert.ok(f.open || f.blocked, `${a.id} ${f.name}: open or a reason`);
    for (const f of items.filter(i => i.open)) assert.ok(f.needs, `${a.id} ${f.name}: open features are role-checked`);
  }
  const viewerOpen = APPS.find(a => a.id === 'odw')!.sections.flatMap(s => s.items).filter(f => f.open && can('viewer', f.needs!)).map(f => `${f.n}`);
  for (const n of ['17', '18', '73', '74', 'O4']) assert.ok(!viewerOpen.includes(n), `a viewer gets no logs, admin tools or tickets (${n})`);
  assert.ok(viewerOpen.includes('W2'), 'a viewer sees totals');
});

import { ADMIN_PACKAGES, APP_ID, AUTH_CALLBACK, BIZ_CALLBACK } from '../src/native/native';
import { cellText, columnsOf, flatRow, heading } from '../src/api/apps';
import { COMBINED } from '../src/apps';

test('Google sign-in returns to THIS admin app: package per build matches the Android package', () => {
  for (const a of APPS) assert.equal(ADMIN_PACKAGES[a.id], a.androidId, a.id);
  assert.equal(ADMIN_PACKAGES.all, COMBINED.androidId);
  assert.equal(APP_ID, 'com.jslproperties.admineab', 'a build without EAB_APP stays Admin EAB');
  assert.equal(AUTH_CALLBACK, 'com.jslproperties.admineab://auth-callback');
  assert.equal(BIZ_CALLBACK, 'com.jslproperties.admineab://biz-callback');
});

test('every tile of the four apps opens a screen, except the payment ones that say why', () => {
  for (const a of APPS.filter(x => x.id !== 'eab')) {
    const items = a.sections.flatMap(s => s.items);
    const closed = items.filter(f => !f.open).map(f => `${f.n}`);
    assert.deepEqual(closed, a.id === 'pos' ? ['P13', 'P14', 'P15'] : [], a.id);
  }
});

test('list helpers: headings, nested records, values in plain words', () => {
  assert.equal(heading('total_rm'), 'Total (RM)');
  assert.equal(heading('progress_pct'), 'Progress (%)');
  assert.equal(heading('names_hidden'), 'Names hidden');
  assert.deepEqual(flatRow({ business: 'A', record: { no: 'R1', total: 5 } }), { business: 'A', no: 'R1', total: 5 });
  assert.equal(cellText(true), 'Yes');
  assert.equal(cellText(null), '');
  assert.equal(cellText(1200.5, 'profit_rm'), '1,200.50');
  assert.equal(cellText({ cash: 2, card: 1 }), 'Cash: 2 · Card: 1');
  assert.deepEqual(columnsOf([{ id: 1, a: 1 }, { b: 2, tenant_id: 'x' }]), ['a', 'b']);
});
