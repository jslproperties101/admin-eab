// Screen tests: the built app (dist/) in a real Chromium, with a FAKE Supabase that answers like the eab_admin_*
// functions. Nothing here talks to a real database. Screenshots go to tests/screens/ (phone 390px and laptop 1366px).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;
const SB = 'https://fake.supabase.co';
const SHOTS = 'tests/screens';
let server, browser;

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  server = await serve('dist', PORT);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const AGENT = 'a1111111-1111-1111-1111-111111111111';
const profile = {
  user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', joined_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-20T06:00:00Z',
  banned_until: null, deleted_at: null, status: 'active', licence: null, workspaces: [{ id: 'w1', name: 'Siti', role: 'owner' }],
  counts: { properties: { total: 2, deleted: 1 }, contacts: { total: 1, deleted: 0 } },
};
const records = {
  properties: [
    { workspace_id: 'w1', collection: 'properties', id: 'p1', data: { ref: 'P1001', askingPrice: 480000, status: 'Booked', street: 'Jalan Ampang', city: 'Kuala Lumpur' }, deleted: false, rev: 2, written_at: '2026-10-20T07:00:00Z', written_by: AGENT },
    { workspace_id: 'w1', collection: 'properties', id: 'p2', data: { ref: 'P1002', askingPrice: 900000 }, deleted: true, rev: 3, written_at: '2026-10-19T07:00:00Z', written_by: AGENT },
  ],
  contacts: [{ workspace_id: 'w1', collection: 'contacts', id: 'c1', data: { name: 'Ali', phone: '0123456789' }, deleted: false, rev: 1, written_at: '2026-10-18T07:00:00Z', written_by: AGENT }],
};
const history = [
  { rev: 2, data: { ref: 'P1001', askingPrice: 480000, status: 'Booked' }, deleted: false, saved_by: AGENT, saved_at: '2026-10-20T07:00:00Z', current: true },
  { rev: 1, data: { ref: 'P1001', askingPrice: 500000, status: 'Available' }, deleted: false, saved_by: AGENT, saved_at: '2026-10-19T07:00:00Z', current: false },
];

/** A page with the fake database. `role` null = Google account not on the admin list. */
async function open({ role = 'owner', width = 390, signedIn = true, lastUsedAgoMs = 0, conn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const calls = [];
  await page.addInitScript(({ SB, signedIn, lastUsedAgoMs, conn }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (conn) localStorage.setItem('admin-eab-conn', JSON.stringify({ supabaseUrl: SB, supabaseAnonKey: 'sb_publishable_test' }));
    if (signedIn) {
      localStorage.setItem('admin-eab-session', JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3600_000, userId: 'me', email: 'joe@example.com' }));
      localStorage.setItem('admin-eab-last-used', String(Date.now() - lastUsedAgoMs));
    }
  }, { SB, signedIn, lastUsedAgoMs, conn });
  const me = role ? { user_id: 'me', email: 'joe@example.com', role, expires_at: null } : null;
  const ok = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const denied = { status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'not allowed' }) };
  await page.route(`${SB}/**`, async route => {
    const url = route.request().url();
    const fn = url.split('/rpc/')[1];
    const args = route.request().postDataJSON?.() ?? {};
    calls.push({ fn: fn ?? url, args });
    if (url.includes('/auth/v1/authorize')) return route.fulfill({ status: 302, headers: { location: `${BASE}?code=fake-code` } });
    if (url.includes('/auth/v1/token')) return route.fulfill(ok({ access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600, user: { id: 'me', email: 'joe@example.com' } }));
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204 });
    const staff = ['owner', 'admin', 'compliance', 'regulator'];
    switch (fn) {
      case 'eab_admin_me': return route.fulfill(ok(me));
      case 'eab_admin_signed_in': return me ? route.fulfill(ok(me)) : route.fulfill(denied);
      case 'eab_admin_search': return staff.includes(role) ? route.fulfill(ok([
        { kind: 'agent', user_id: AGENT, email: profile.email, name: profile.name, label: profile.name },
        { kind: 'record', user_id: AGENT, email: profile.email, collection: 'properties', record_id: 'p1', workspace_id: 'w1', deleted: false, label: 'P1001', sub: 'Jalan Ampang, Kuala Lumpur' }])) : route.fulfill(denied);
      case 'eab_admin_agent': return route.fulfill(ok(profile));
      case 'eab_admin_agent_records': return route.fulfill(ok((records[args.p_collection] ?? []).filter(r => args.p_include_deleted || !r.deleted).slice(args.p_offset ?? 0)));
      case 'eab_admin_record_history': return route.fulfill(ok(history));
      case 'eab_admin_export': return ['owner', 'compliance'].includes(role) ? route.fulfill(ok({ reference: 'EAB-20261021-000007', at: '2026-10-20T18:00:00Z' })) : route.fulfill(denied);
      case 'eab_admin_list_log': return route.fulfill(ok(args.p_log === 'actions'
        ? [{ seq: 2, at: '2026-10-20T18:00:00Z', admin_user: 'me', admin_email: 'joe@example.com', admin_role: 'owner', action: 'admin_added', target_user: 'x', target_ref: 'staff@example.com', reason: 'New compliance officer', before: null, after: {}, device: 'web', hash: 'h' }]
        : [{ seq: 9, at: '2026-10-20T18:00:00Z', admin_user: 'me', admin_email: 'joe@example.com', admin_role: 'owner', kind: 'export', target_user: AGENT, target_ref: 'EAB-20261021-000007', detail: { format: 'pdf' }, device: 'web', hash: 'h' }]));
      case 'eab_admin_verify_chain': return route.fulfill(ok({ actions: { ok: true, checked: 2, first_bad_seq: null }, access: { ok: true, checked: 9, first_bad_seq: null } }));
      case 'eab_admin_list_admins': return route.fulfill(ok([{ user_id: 'me', email: 'joe@example.com', role: 'owner', active: true, expires_at: null, added_at: '2026-10-20T00:00:00Z', added_by: null }]));
      case 'eab_admin_set_admin': return route.fulfill(ok({ user_id: 'x', email: args.p_email, role: args.p_role, active: args.p_active, expires_at: args.p_expires_at, added_at: '2026-10-20T00:00:00Z', added_by: 'me' }));
      default: return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
  });
  await page.goto(BASE);
  return { page, ctx, calls };
}

test('no connection set up: the sign-in screen says so, and refuses a secret key', async () => {
  const { page, ctx } = await open({ signedIn: false, conn: false });
  await page.getByTestId('login-not-set-up').waitFor();
  await page.getByPlaceholder('https://xxxx.supabase.co').fill('https://abcd.supabase.co');
  await page.getByPlaceholder(/eyJ/).fill('sb_secret_DO_NOT_USE');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText(/SECRET \/ service-role key/).waitFor();
  await page.screenshot({ path: `${SHOTS}/01-login-not-set-up-phone.png`, fullPage: true });
  await ctx.close();
});

test('Google sign-in by an account NOT on the admin list is refused and signed out', async () => {
  const { page, ctx, calls } = await open({ role: null, signedIn: false });
  await page.getByTestId('google-sign-in').click();
  await page.getByTestId('login-notice').waitFor();
  assert.match(await page.getByTestId('login-notice').innerText(), /not on the Admin EAB list/);
  const auth = calls.find(c => c.fn.includes('/auth/v1/authorize'));
  assert.ok(auth && /provider=google/.test(auth.fn) && /code_challenge_method=s256/.test(auth.fn), 'PKCE Google sign-in');
  assert.ok(calls.some(c => c.fn === 'eab_admin_signed_in'));
  assert.ok(calls.some(c => c.fn.includes('/auth/v1/logout')), 'signed out on the server too');
  assert.equal(await page.evaluate(() => localStorage.getItem('admin-eab-session')), null, 'no session kept');
  await page.screenshot({ path: `${SHOTS}/02-not-on-list-phone.png`, fullPage: true });
  await ctx.close();
});

test('15 minutes without use: signed out on opening', async () => {
  const { page, ctx } = await open({ lastUsedAgoMs: 16 * 60_000 });
  await page.getByTestId('login-notice').waitFor();
  assert.match(await page.getByTestId('login-notice').innerText(), /15 minutes/);
  await ctx.close();
});

test('owner: home sections, search, Agent Profile with deleted record and history (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 390 });
  await page.getByTestId('role').waitFor();
  assert.equal(await page.getByTestId('role').innerText(), 'Owner');
  for (const s of ['Compliance', 'Security', 'Communication & Operations', 'Users & Growth', 'Content & Business', 'System Health', 'Money'])
    assert.ok(await page.getByRole('heading', { name: s, exact: true }).isVisible(), s);
  assert.ok(await page.getByTestId('tile-14').isEnabled());
  assert.ok(await page.getByTestId('tile-17').isEnabled(), 'owner manages admins');
  await page.screenshot({ path: `${SHOTS}/03-home-owner-phone.png`, fullPage: true });

  await page.getByTestId('global-search').fill('siti');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByTestId('hit-agent').first().click();
  await page.getByTestId('agent-status').waitFor();
  assert.ok(await page.getByTestId('tab-properties').innerText().then(t => /Listings 2 · 1 deleted/.test(t)));
  await page.getByTestId('record-list').waitFor();
  assert.ok(await page.getByText('Deleted — kept for audit').isVisible());
  await page.getByTestId('record').first().click();
  await page.getByTestId('show-history').click();
  await page.getByTestId('history').waitFor();
  assert.match(await page.getByTestId('history').innerText(), /Asking price 500000 → 480000; Status Available → Booked/);
  await page.screenshot({ path: `${SHOTS}/04-agent-profile-phone.png`, fullPage: true });
  assert.ok(calls.some(c => c.fn === 'eab_admin_search' && c.args.p_q === 'siti' && c.args.p_device), 'search sends device for the access log');
  await ctx.close();
});

test('compliance: PDF and Excel exports get a reference number and download (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 1366 });
  await page.getByTestId('tile-14').click();
  await page.getByTestId('search-input').fill('siti');
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  await page.getByTestId('hit-record').click();
  await page.getByTestId('record-list').waitFor();
  await page.screenshot({ path: `${SHOTS}/05-agent-profile-laptop.png`, fullPage: true });
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
  assert.equal(xlsx.suggestedFilename(), 'EAB-20261021-000007-agent.xlsx');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('export-pdf').click()]);
  assert.equal(pdf.suggestedFilename(), 'EAB-20261021-000007-agent.pdf');
  const pdfBytes = await (await import('node:fs/promises')).readFile(await pdf.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const reg = calls.filter(c => c.fn === 'eab_admin_export');
  assert.deepEqual(reg.map(c => c.args.p_format), ['xlsx', 'pdf']);
  assert.ok(reg.every(c => c.args.p_target === AGENT));
  assert.ok(calls.some(c => c.fn === 'eab_admin_record_history'), 'history included');
  await ctx.close();
});

test('admin role: can view an agent but has no export and no logs', async () => {
  const { page, ctx } = await open({ role: 'admin', width: 1366 });
  await page.getByTestId('role').waitFor();
  assert.equal(await page.getByTestId('tile-18').count(), 0, 'audit log not open for admin');
  await page.getByTestId('tile-14').click();
  await page.getByTestId('search-input').fill('siti');
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  await page.getByTestId('hit-agent').click();
  await page.getByTestId('agent-status').waitFor();
  assert.equal(await page.getByTestId('export-pdf').count(), 0);
  await ctx.close();
});

test('viewer: no search box and no personal-data features', async () => {
  const { page, ctx } = await open({ role: 'viewer' });
  await page.getByTestId('role').waitFor();
  assert.equal(await page.getByTestId('global-search').count(), 0);
  assert.equal(await page.getByTestId('tile-14').count(), 0);
  await ctx.close();
});

test('owner: audit log, integrity check, and adding an admin needs a reason and a second confirmation', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-18').click();
  await page.getByTestId('log-table').waitFor();
  await page.getByTestId('verify').click();
  assert.match(await page.getByTestId('chain-result').innerText(), /Both logs are intact/);
  await page.screenshot({ path: `${SHOTS}/06-audit-log-laptop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-17').click();
  await page.getByTestId('admins-table').waitFor();
  await page.getByTestId('admin-email').fill('staff@example.com');
  await page.getByTestId('admin-role').selectOption('compliance');
  await page.getByTestId('admin-save').click();
  const cont = page.getByRole('button', { name: 'Continue' });
  assert.ok(await cont.isDisabled(), 'reason required');
  await page.getByPlaceholder(/At least 5 characters/).fill('New compliance officer');
  await cont.click();
  assert.equal(calls.filter(c => c.fn === 'eab_admin_set_admin').length, 0, 'nothing saved before the second confirmation');
  await page.screenshot({ path: `${SHOTS}/07-confirm-admin-change-laptop.png` });
  await page.getByTestId('confirm-final').click();
  await page.getByText('Saved staff@example.com.').waitFor();
  const set = calls.find(c => c.fn === 'eab_admin_set_admin');
  assert.equal(set.args.p_reason, 'New compliance officer');
  assert.equal(set.args.p_role, 'compliance');
  await ctx.close();
});

test('sign out clears the session', async () => {
  const { page, ctx } = await open({ role: 'owner' });
  await page.getByTestId('sign-out').click();
  await page.getByTestId('login').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('admin-eab-session')), null);
  await ctx.close();
});
