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
  const sharedOpen = APPS.find(a => a.id === 'odw')!.sections.flatMap(s => s.items).filter(f => f.open && can('viewer', f.needs!));
  assert.equal(sharedOpen.length, 0, 'a viewer gets no logs or admin tools');
});
