import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connProblem, isSecretKey } from '../src/config';
import { can, ALL_ROLES } from '../src/admin/roles';
import { isIdle, IDLE_MS } from '../src/admin/idle';
import { errorFrom, rpc, toSession, ApiError, Session } from '../src/api/session';
import { authorizeUrl, challengeFor, newVerifier } from '../src/api/auth';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.sig`;

test('a service-role or secret key is refused; the public key is accepted', () => {
  assert.equal(isSecretKey(jwt('service_role')), true);
  assert.equal(isSecretKey('sb_secret_abc123'), true);
  assert.equal(isSecretKey(jwt('anon')), false);
  assert.equal(isSecretKey('sb_publishable_abc'), false);
  assert.equal(connProblem('https://abcd.supabase.co', jwt('service_role')), 'secret');
  assert.equal(connProblem('https://abcd.supabase.co', jwt('anon')), null);
  assert.equal(connProblem('http://abcd.supabase.co', 'k'), 'url');
  assert.equal(connProblem('https://supabase.com/dashboard/project/x', 'k'), 'url');
  assert.equal(connProblem('https://abcd.supabase.co', ''), 'pair');
  assert.equal(connProblem('', ''), null);
});

test('roles: who may do what (mirrors the database rules)', () => {
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'export')), ['owner', 'compliance']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'viewLogs')), ['owner', 'compliance']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'manageAdmins')), ['owner']);
  assert.deepEqual(ALL_ROLES.filter(r => can(r, 'viewAgent')), ['owner', 'admin', 'compliance', 'regulator']);
  assert.equal(can('viewer', 'search'), false);
  assert.equal(can(null, 'search'), false);
});

test('idle: 15 minutes without use signs out', () => {
  assert.equal(IDLE_MS, 15 * 60_000);
  const t = 1_800_000_000_000;
  assert.equal(isIdle(t, t + IDLE_MS - 1), false);
  assert.equal(isIdle(t, t + IDLE_MS), true);
  assert.equal(isIdle(null, t), false);
});

test('database errors become plain codes', () => {
  assert.equal(errorFrom(403, { code: '42501', message: 'not allowed' }).code, 'not-allowed');
  assert.equal(errorFrom(400, { code: '42501' }).code, 'not-allowed');
  assert.equal(errorFrom(400, { code: 'P0002', message: 'agent not found' }).code, 'not-found');
  assert.equal(errorFrom(401, null).code, 'expired');
  assert.equal(errorFrom(500, { message: 'boom' }).code, 'server');
});

const conn = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' };
const sess = (exp: number): Session => ({ accessToken: 'old', refreshToken: 'r1', expiresAt: exp, userId: 'u', email: 'e' });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('rpc: calls only eab_admin_* functions, sends the token, refreshes once on 401', async () => {
  await assert.rejects(rpc(conn, sess(Date.now() + 3600_000), 'eab_records', {}, () => {}), ApiError);
  const calls: string[] = [];
  let updated: Session | null | undefined;
  const fake = (async (url: string, init: RequestInit) => {
    calls.push(`${url} ${(init.headers as Record<string, string>).Authorization}`);
    if (url.includes('/auth/v1/token')) return json(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u' } });
    if (calls.filter(c => c.includes('/rpc/')).length === 1) return json(401, { code: 'PGRST301' });
    return json(200, { ok: 1 });
  }) as unknown as typeof fetch;
  const r = await rpc<{ ok: number }>(conn, sess(Date.now() + 3600_000), 'eab_admin_me', {}, s => { updated = s; }, fake);
  assert.deepEqual(r, { ok: 1 });
  assert.equal(calls[0], 'https://x.supabase.co/rest/v1/rpc/eab_admin_me Bearer old');
  assert.ok(calls[1].includes('/auth/v1/token?grant_type=refresh_token'));
  assert.equal(calls[2], 'https://x.supabase.co/rest/v1/rpc/eab_admin_me Bearer new');
  assert.equal(updated?.accessToken, 'new');
});

test('rpc: a refused refresh signs the admin out (session cleared)', async () => {
  let updated: Session | null | undefined = undefined;
  const fake = (async (url: string) => (url.includes('/auth/v1/token') ? json(400, {}) : json(401, {}))) as unknown as typeof fetch;
  await assert.rejects(rpc(conn, sess(Date.now() - 1000), 'eab_admin_me', {}, s => { updated = s; }, fake), (e: ApiError) => e.code === 'expired');
  assert.equal(updated, null);
});

test('rpc: "not allowed" from the database is reported as not-allowed', async () => {
  const fake = (async () => json(403, { code: '42501', message: 'not allowed' })) as unknown as typeof fetch;
  await assert.rejects(rpc(conn, sess(Date.now() + 3600_000), 'eab_admin_search', {}, () => {}, fake), (e: ApiError) => e.code === 'not-allowed');
});

test('Google sign-in uses PKCE S256', async () => {
  const v = newVerifier();
  assert.ok(v.length >= 43 && v.length <= 128 && /^[A-Za-z0-9_-]+$/.test(v));
  const c = await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(c, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'); // RFC 7636 example
  const u = new URL(authorizeUrl(conn, 'com.jslproperties.admineab://auth-callback', c));
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  assert.equal(u.searchParams.get('redirect_to'), 'com.jslproperties.admineab://auth-callback');
});

test('toSession reads expiry', () => {
  const s = toSession({ access_token: 'a', refresh_token: 'b', expires_in: 10, user: { id: 'u', email: 'e@x' } }, 1000);
  assert.equal(s.expiresAt, 11_000);
  assert.equal(s.email, 'e@x');
});
