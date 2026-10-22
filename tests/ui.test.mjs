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
const baseProfile = () => ({
  user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', joined_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-20T06:00:00Z',
  banned_until: null, deleted_at: null, status: 'active', status_reason: null, force_logout_after: null,
  licence: 'REN 31234 (not verified)', licence_detail: { type: 'REN', number: '31234', verified: false, verified_at: null },
  terms: { version: '1.1-draft', at: '2026-10-19T02:00:00Z' }, marketing: false,
  last_login: { at: '2026-10-20T06:00:00Z', event: 'sign_in', platform: 'android', app_version: '2.2.0' },
  workspaces: [{ id: 'w1', name: 'Siti', role: 'owner' }],
  counts: { properties: { total: 2, deleted: 1 }, contacts: { total: 1, deleted: 0 } },
});
const loginLog = [
  { seq: 4, happened_at: '2026-10-20T06:00:00Z', received_at: '2026-10-20T06:00:01Z', event: 'sign_in', device_id: 'd1', device: 'Samsung S23', platform: 'android', app_version: '2.2.0', lat: 3.1579, lng: 101.7116, acc: 12, detail: null },
  { seq: 3, happened_at: '2026-10-20T05:00:00Z', received_at: '2026-10-20T06:00:01Z', event: 'locked_out', device_id: 'd1', device: 'Samsung S23', platform: 'android', app_version: '2.2.0', lat: null, lng: null, acc: null, detail: null },
  { seq: 2, happened_at: '2026-10-20T04:59:00Z', received_at: '2026-10-20T06:00:01Z', event: 'sign_in_failed', device_id: 'd1', device: 'Samsung S23', platform: 'android', app_version: '2.2.0', lat: null, lng: null, acc: null, detail: 'cancelled' },
];
const termsLog = [
  { seq: 2, at: '2026-10-19T02:00:00Z', kind: 'marketing', terms_version: null, accepted: false, device_id: 'd1' },
  { seq: 1, at: '2026-10-19T02:00:00Z', kind: 'terms', terms_version: '1.1-draft', accepted: true, device_id: 'd1' },
];
const agentRow = p => ({ user_id: p.user_id, email: p.email, name: p.name, joined_at: p.joined_at, status: p.status, status_reason: p.status_reason,
  status_changed_at: p.status === 'active' ? null : '2026-10-20T07:00:00Z', force_logout_after: p.force_logout_after, licence: p.licence_detail,
  last_login: p.last_login, failed_30d: 1, lockouts_30d: 1, blocked_30d: 0, terms_version: '1.1-draft', records: 3 });
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

/** AdminBatch004 fake System Health data (counts only, like the real functions). */
function healthFake() {
  const MB = 1024 * 1024;
  const limits = { db_limit_mb: 500, storage_limit_mb: 1024, aws_backup: 'not_set_up', aws_note: null, updated_at: '2026-10-21T00:00:00Z', updated_by: null };
  const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 22 - (n - 1 - i))).toISOString().slice(0, 10));
  const h = {
    dash: ['owner', 'admin', 'compliance', 'viewer'], staff: ['owner', 'admin', 'compliance'], limits, tests: [],
    db: () => ({ checked_at: '2026-10-22T01:00:00Z', db_bytes: 17 * MB, postgres: '17.11', connections: { total: 13, active: 1, idle: 12, idle_in_transaction: 0, max: 60 },
      longest_query_s: 0, slow_queries: 0, stats: { cache_hit_pct: 99.87, commits: 52000, rollbacks: 40, deadlocks: 0, temp_bytes: 0, since: '2026-10-15T10:52:00Z' },
      tables: [
        { name: 'eab_usage_events', total_bytes: 1.2 * MB, data_bytes: 0.8 * MB, rows: 1380, dead_rows: 12, last_vacuum: '2026-10-21T03:00:00Z', last_analyze: '2026-10-21T03:00:00Z', seq_scans: 40, index_scans: 900 },
        { name: 'eab_records', total_bytes: 0.4 * MB, data_bytes: 0.2 * MB, rows: 28, dead_rows: 30, last_vacuum: null, last_analyze: null, seq_scans: 10, index_scans: 90 },
      ], limits }),
    storage: () => ({ checked_at: '2026-10-22T01:00:00Z', today: { day: '2026-10-22', db_bytes: 17 * MB, storage_bytes: 26 * MB, storage_files: 94 },
      buckets: [{ bucket: 'eab-files', files: 90, bytes: 25 * MB, first_at: '2026-10-17T09:41:00Z', last_at: '2026-10-21T08:00:00Z' }, { bucket: 'eab-vault', files: 4, bytes: 1 * MB, first_at: null, last_at: '2026-10-21T08:00:00Z' }],
      uploads: [{ day: '2026-10-17', files: 40, bytes: 10 * MB }, { day: '2026-10-19', files: 30, bytes: 8 * MB }, { day: '2026-10-21', files: 24, bytes: 8 * MB }],
      daily: days(5).map((d, i) => ({ day: d, db_bytes: (13 + i) * MB, storage_bytes: (22 + i) * MB, storage_files: 80 + i })),
      limits, backup_tests: { count: h.tests.length, last: h.tests[0] ?? null, last_restore_pass: h.tests.find(t => t.kind === 'restore_test' && t.result === 'pass') ?? null } }),
    push: { checked_at: '2026-10-22T01:00:00Z', agents: 6, agents_with_phone: 4, phones: [{ platform: 'android', phones: 5, agents: 4 }],
      broadcasts: [{ item_id: 'f1', title: 'OPR cut: what it means', status: 'done', queued_at: '2026-10-21T02:00:00Z', finished_at: '2026-10-21T02:01:00Z',
        targeted: 6, sent: 4, failed: 1, no_phone: 2, received: 3, opened: 2, errors: { 'token.expired': 1 } }], other_pushes_30d: { team_invite: 2 } },
    perf: { days: 30, checked_at: '2026-10-22T01:00:00Z', startup: [{ app_version: '2.2.0', platform: 'android', opens: 3, avg_ms: 9584, p50_ms: 9100, p90_ms: 11800, max_ms: 12000 }],
      startup_all: { opens: 3, avg_ms: 9584, p50_ms: 9100, p90_ms: 11800 }, sessions_by_day: days(7).map((d, i) => ({ day: d, sessions: 4 + i, agents: 2 })),
      versions: [{ app_version: '2.2.0', agents: 3 }, { app_version: '2.1.4', agents: 1 }], google_calls: { calls: 41, failed: 0 } },
    sync: { days: 30, checked_at: '2026-10-22T01:00:00Z', totals: { runs: 98, fails: 11, agents: 3, agents_failing: 1 },
      by_day: days(7).map((d, i) => ({ day: d, runs: 10 + i, fails: i === 3 ? 6 : 0 })),
      agents: [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', runs: 60, fails: 11, last_run: '2026-10-21T09:00:00Z', last_fail: '2026-10-20T09:00:00Z',
        last_ok: '2026-10-21T09:00:00Z', pending: 3, local_bytes: 15000000, app_version: '2.2.0', platform: 'android', phones: 2 }] },
    errors: { checked_at: '2026-10-22T01:00:00Z', counts: { new: 1 },
      reports: [{ id: 'r1', user_id: AGENT, email: 'agent@example.com', description: 'Photo upload stuck at 90%', has_screenshot: true, app_version: '2.2.0', platform: 'android', language: 'en', screen: 'listing-form', status: 'new', created_at: '2026-10-21T05:00:00Z' }],
      failures_7d: [{ kind: 'sync', name: 'sync.run', failed: 11, total: 98, agents: 1, last_at: '2026-10-20T09:00:00Z' }] },
  };
  return h;
}

/** A page with the fake database. `role` null = Google account not on the admin list. */
// AdminBatch005 — Dashboards: answers like the eab_admin_dash_* functions. Viewer gets totals only (lists are null).
function dashFake() {
  const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 22 - (n - 1 - i))).toISOString().slice(0, 10));
  const staff = ['owner', 'admin', 'compliance'], dash = [...staff, 'viewer'];
  const named = (role, v) => (staff.includes(role) ? v : null);
  const siti = { user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent' };
  return {
    dash, staff,
    growth: a => ({ from: a.p_from, to: a.p_to, bucket: a.p_bucket, total: 6, before: 0, new: 6,
      buckets: days(30).map((d, i) => ({ start: d, new: i === 25 ? 2 : i === 26 ? 3 : i === 28 ? 1 : 0, running: i < 25 ? 0 : i === 25 ? 2 : i < 28 ? 5 : 6 })) }),
    active: a => { const by = days(30).map((d, i) => ({ day: d, dau: i >= 25 ? (i % 2) + 1 : 0, wau: i >= 25 ? 3 : 0, mau: i >= 25 ? 4 : 0 }));
      return { from: a.p_from, to: a.p_to, agents: 6, active_in_range: 4, avg_dau: 0.27, avg_wau: 0.5, avg_mau: 0.67, stickiness_pct: 40.3, last: by[29], by_day: by }; },
    retention: (a, role) => ({ from: a.p_from, to: a.p_to, joined: 6, names_hidden: !staff.includes(role),
      retention: [{ days: 7, eligible: 0, kept: 0, pct: null }, { days: 30, eligible: 0, kept: 0, pct: null }, { days: 90, eligible: 0, kept: 0, pct: null }],
      cohorts: [{ month: '2026-10-01', joined: 6, kept7: 0, eligible7: 0, kept30: 0, eligible30: 0, kept90: 0, eligible90: 0 }],
      at_risk: { count: 1, agents: named(role, [{ ...siti, last_day: '2026-10-05', days_since: 17, recent_days: 0, prior_days: 3, reason: 'no_activity_14d' }]) } }),
    inactive: (a, role) => ({ days: a.p_days, checked_at: '2026-10-22T04:00:00Z', agents: 6, counts: { 30: 2, 60: 1, 90: 0 }, never_opened: 2, names_hidden: !staff.includes(role),
      list: named(role, a.p_days === 30
        ? [{ ...siti, joined: '2026-08-01', last_open: '2026-09-10', last_sign_in: '2026-09-10', last_seen: '2026-09-10', days_since: 42, app_version: '2.1.0', platform: 'android', status: 'active' },
           { user_id: 'b2', email: 'old@example.com', name: null, joined: '2026-07-01', last_open: null, last_sign_in: null, last_seen: null, days_since: 113, app_version: null, platform: null, status: 'suspended' }]
        : [{ user_id: 'b2', email: 'old@example.com', name: null, joined: '2026-07-01', last_open: null, last_sign_in: null, last_seen: null, days_since: 113, app_version: null, platform: null, status: 'suspended' }]) }),
    devices: (a, role) => ({ from: a.p_from, to: a.p_to, agents: 4,
      versions: [{ app_version: '2.2.0', agents: 3, last_seen: '2026-10-22T03:00:00Z' }, { app_version: '2.10.0', agents: 1, last_seen: '2026-10-22T02:00:00Z' }],
      platforms: [{ platform: 'android', agents: 3 }, { platform: 'web', agents: 1 }],
      devices: [{ device: 'SM-S918B', platform: 'android', agents: 2 }, { device: '25078RA3EY', platform: 'android', agents: 1 }, { device: 'unknown', platform: 'web', agents: 1 }],
      languages: [{ language: 'en', agents: 2 }, { language: 'ms', agents: 1 }, { language: 'unknown', agents: 1 }], language_events: { en: 5, ms: 1 },
      version_agents: a.p_version ? [{ ...siti, platform: 'android', device: 'SM-S918B', last_seen: '2026-10-22T02:00:00Z' }] : null }),
    listings: (a, role) => ({ from: a.p_from, to: a.p_to, stale_days: a.p_stale_days, checked_at: '2026-10-22T04:00:00Z', total: 9, deleted: 1, agents_with_listings: 3,
      by_status: { available: 4, booked_pending_loan: 1, booked_pending_spa: 1, rented_pending_ta: 1, sold: 1, needs_check: 1 }, by_purpose: { sale: 6, rent: 2, none: 1 },
      by_type: [{ type: 'Terrace house', listings: 4 }, { type: 'Condo / apartment', listings: 3 }, { type: 'Not set', listings: 2 }],
      by_state: [{ state: 'Selangor', listings: 5 }, { state: 'Kuala Lumpur', listings: 4 }], new_by_month: [{ month: '2026-10-01', new: 9 }],
      pipeline: { sale: [{ stage: 'booked', listings: 1, parts: { booked: 0, booked_pending_spa: 1, booked_other_agent: 0, booked_pending_consent: 0 } },
        { stage: 'booked_pending_loan', listings: 1 }, { stage: 'booked_spa_signed', listings: 0 }, { stage: 'sold', listings: 1 }],
        rent: [{ stage: 'rented_pending_ta', listings: 1 }, { stage: 'rented', listings: 0 }] },
      stale_count: 1, names_hidden: !staff.includes(role),
      stale: named(role, [{ ...siti, id: 'p1', ref: 'P1001', headline: 'Corner terrace, Shah Alam', type: 'Terrace house', state: 'Selangor', city: 'Shah Alam', updated_at: '2026-07-01T00:00:00Z', days: 113 }]) }),
    usage: a => ({ from: a.p_from, to: a.p_to, detail_from: '2026-10-18',
      ranking: [{ kind: 'screen', name: 'home', events: 234, agents: 4, failures: 0 }, { kind: 'sync', name: 'sync.run', events: 105, agents: 3, failures: 3 },
        { kind: 'screen', name: 'listing', events: 61, agents: 3, failures: 0 }, { kind: 'feature', name: 'properties.create', events: 4, agents: 2, failures: 0 },
        { kind: 'google', name: 'geocoding.reverse', events: 20, agents: 2, failures: 1 }],
      not_used: [{ kind: 'screen', name: 'dev-dashboard' }],
      heatmap: [{ dow: 1, hour: 9, events: 30 }, { dow: 3, hour: 21, events: 80 }, { dow: 6, hour: 14, events: 12 }],
      by_day: days(5).map((d, i) => ({ day: d, events: 40 + i * 10, agents: 2 })) }),
    events: a => ({ kind: a.p_kind, name: a.p_name, from: a.p_from, to: a.p_to, total: 2,
      events: [{ at: '2026-10-21T08:00:00Z', ...siti, screen: null, ok: true, n: null, value: null, app_version: '2.2.0', platform: 'android', device: 'SM-S918B' },
        { at: '2026-10-20T08:00:00Z', ...siti, screen: null, ok: false, n: null, value: null, app_version: '2.2.0', platform: 'android', device: 'SM-S918B' }] }),
  };
}

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
  const profile = baseProfile();
  let settings = { company_name: 'JSL Global Trading', support_email: null, business_address: null, updated_at: '2026-10-20T00:00:00Z', updated_by: null };
  // AdminBatch003 fake state
  const cases = new Map(); const packs = []; const objects = new Map(); let seq = 0;
  const caseJson = c => ({ ...c, packs: packs.filter(p => p.case_id === c.id), ...(role === 'regulator' ? {} : { grants: c.grants }) });
  if (role === 'regulator') cases.set('c-reg', { id: 'c-reg', case_no: 'CASE-2026-0009', requester_type: 'police', requester_name: 'IPD Dang Wangi', requester_ref: 'RPT/77',
    requester_contact: null, received_on: '2026-10-18', deadline: '2026-10-30', description: 'Fraud report about listing P1002', status: 'open', outcome: null,
    created_by: 'x', created_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:00Z', closed_at: null,
    agents: [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', date_from: '2026-10-01', date_to: null, added_at: '2026-10-18T00:00:00Z', removed_at: null }], grants: [] });
  const health = healthFake();
  const dash = dashFake();
  const ok = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const denied = { status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'not allowed' }) };
  await page.route(`${SB}/**`, async route => {
    const url = route.request().url();
    const fn = url.split('/rpc/')[1];
    let args = {};
    if (fn) { try { args = route.request().postDataJSON() ?? {}; } catch { args = {}; } }
    calls.push({ fn: fn ?? url, args });
    if (url.includes('/auth/v1/authorize')) return route.fulfill({ status: 302, headers: { location: `${BASE}?code=fake-code` } });
    if (url.includes('/auth/v1/token')) return route.fulfill(ok({ access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600, user: { id: 'me', email: 'joe@example.com' } }));
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (url.includes('/storage/v1/object/')) {
      const path = decodeURIComponent(url.split('/eab-vault/')[1]);
      if (route.request().method() === 'POST') {
        const pk = packs.find(p => `${p.id}/${p.sha256}` === path && !p.stored);
        if (!pk || objects.has(path)) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
        objects.set(path, route.request().postDataBuffer());
        calls.push({ fn: 'storage_upload', args: { path, bytes: route.request().postDataBuffer().length } });
        return route.fulfill(ok({ Key: `eab-vault/${path}` }));
      }
      calls.push({ fn: 'storage_download', args: { path } });
      return objects.has(path) ? route.fulfill({ status: 200, body: objects.get(path), contentType: 'application/octet-stream' }) : route.fulfill({ status: 400, body: '{}' });
    }
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
      // AdminBatch002
      case 'eab_admin_agents': {
        if (!staff.includes(role)) return route.fulfill(denied);
        const row = agentRow(profile);
        const keep = args.p_filter === 'all' || (args.p_filter === 'not_active' && row.status !== 'active')
          || (args.p_filter === 'licence' && row.licence) || (args.p_filter === 'security' && row.failed_30d + row.lockouts_30d > 0);
        return route.fulfill(ok(keep ? [row] : []));
      }
      case 'eab_admin_login_log': return route.fulfill(ok(loginLog));
      case 'eab_admin_terms_log': return route.fulfill(ok(termsLog));
      case 'eab_admin_settings': return role === 'regulator' || !role ? route.fulfill(denied) : route.fulfill(ok(settings));
      case 'eab_admin_set_settings': {
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        if (!args.p_reason) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'a reason is required' }) });
        settings = { ...settings, ...args.p_patch, updated_at: '2026-10-21T00:00:00Z' };
        return route.fulfill(ok(settings));
      }
      case 'eab_admin_set_account_status':
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        profile.status = args.p_status; profile.status_reason = args.p_reason; profile.force_logout_after = '2026-10-21T00:00:00Z';
        return route.fulfill(ok({ user_id: AGENT, status: args.p_status }));
      case 'eab_admin_force_logout':
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        profile.force_logout_after = '2026-10-21T00:00:00Z';
        return route.fulfill(ok({ user_id: AGENT }));
      case 'eab_admin_verify_licence':
        if (!['owner', 'admin', 'compliance'].includes(role)) return route.fulfill(denied);
        profile.licence_detail = { ...profile.licence_detail, verified: args.p_verified, verified_at: args.p_verified ? '2026-10-21T00:00:00Z' : null };
        profile.licence = `REN 31234 (${args.p_verified ? 'verified' : 'not verified'})`;
        return route.fulfill(ok(profile.licence_detail));
      // AdminBatch003
      case 'eab_admin_cases': return ['owner', 'compliance', 'regulator'].includes(role)
        ? route.fulfill(ok([...cases.values()].filter(c => !args.p_status || c.status === args.p_status).map(c => ({ ...c, agents: c.agents.filter(a => !a.removed_at).length, packs: packs.filter(p => p.case_id === c.id && p.stored).length }))))
        : route.fulfill(denied);
      case 'eab_admin_case': return cases.has(args.p_case) ? route.fulfill(ok(caseJson(cases.get(args.p_case)))) : route.fulfill(denied);
      case 'eab_admin_case_create': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const id = `c-${++seq}`;
        cases.set(id, { id, case_no: `CASE-2026-000${seq}`, ...args.p, requester_ref: args.p.requester_ref || null, requester_contact: args.p.requester_contact || null,
          deadline: args.p.deadline || null, status: 'open', outcome: null, created_by: 'me', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z', closed_at: null, agents: [], grants: [] });
        return route.fulfill(ok(caseJson(cases.get(id))));
      }
      case 'eab_admin_case_add_agent': {
        const c = cases.get(args.p_case);
        c.agents.push({ user_id: args.p_agent, email: 'agent@example.com', name: 'Siti Agent', date_from: args.p_from, date_to: args.p_to, added_at: '2026-10-21T00:00:00Z', removed_at: null });
        return route.fulfill(ok(caseJson(c)));
      }
      case 'eab_admin_case_remove_agent': {
        const c = cases.get(args.p_case); c.agents.find(a => a.user_id === args.p_agent).removed_at = '2026-10-21T01:00:00Z';
        return route.fulfill(ok(caseJson(c)));
      }
      case 'eab_admin_case_update': {
        const c = cases.get(args.p_case); Object.assign(c, args.p, args.p.status === 'closed' ? { closed_at: '2026-10-21T02:00:00Z' } : {});
        return route.fulfill(ok(caseJson(c)));
      }
      case 'eab_admin_case_grant': {
        if (role !== 'owner') return route.fulfill(denied);
        const c = cases.get(args.p_case); c.grants = [{ admin_user: 'reg1', email: args.p_email, expires_at: args.p_expires_at, granted_at: '2026-10-21T00:00:00Z', active: true }];
        return route.fulfill(ok(caseJson(c)));
      }
      case 'eab_admin_case_revoke': {
        const c = cases.get(args.p_case); c.grants = c.grants.map(g => ({ ...g, active: false }));
        return route.fulfill(ok(caseJson(c)));
      }
      case 'eab_admin_pack_register': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const pk = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ...args.p, stored: false, created_by: 'me', created_at: '2026-10-21T03:00:00Z', created_by_email: 'joe@example.com' };
        packs.push(pk); return route.fulfill(ok(pk));
      }
      case 'eab_admin_pack_stored': {
        const pk = packs.find(p => p.id === args.p_pack);
        if (!objects.has(`${pk.id}/${pk.sha256}`)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'P0002', message: 'the file is not in the vault yet' }) });
        pk.stored = true; return route.fulfill(ok(pk));
      }
      case 'eab_admin_vault': return route.fulfill(ok(packs.filter(p => p.stored).map(p => ({ ...p, case_no: p.case_id ? cases.get(p.case_id)?.case_no : null, agent_email: p.agent_user ? 'agent@example.com' : null }))));
      case 'eab_admin_pack_download': { const pk = packs.find(p => p.id === args.p_pack); return route.fulfill(ok({ path: `${pk.id}/${pk.sha256}`, file_name: pk.file_name, format: pk.format, sha256: pk.sha256 })); }
      case 'eab_admin_check_file': return route.fulfill(ok(packs.find(p => p.sha256 === args.p_sha256 && p.stored) ?? null));
      // AdminBatch004 — System Health
      case 'eab_admin_health_db': return health.dash.includes(role) ? route.fulfill(ok(health.db())) : route.fulfill(denied);
      case 'eab_admin_health_storage': return health.dash.includes(role) ? route.fulfill(ok(health.storage())) : route.fulfill(denied);
      case 'eab_admin_backup_tests': return health.dash.includes(role) ? route.fulfill(ok(health.tests)) : route.fulfill(denied);
      case 'eab_admin_push_health': return health.dash.includes(role) ? route.fulfill(ok(health.push)) : route.fulfill(denied);
      case 'eab_admin_performance': return health.dash.includes(role) ? route.fulfill(ok(health.perf)) : route.fulfill(denied);
      case 'eab_admin_sync_health': return health.staff.includes(role) ? route.fulfill(ok(health.sync)) : route.fulfill(denied);
      case 'eab_admin_error_reports': return health.staff.includes(role) ? route.fulfill(ok(health.errors)) : route.fulfill(denied);
      case 'eab_admin_set_health_limits':
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        Object.assign(health.limits, args.p_patch, { updated_at: '2026-10-22T02:00:00Z' });
        return route.fulfill(ok(health.limits));
      case 'eab_admin_backup_test_add': {
        if (!health.staff.includes(role)) return route.fulfill(denied);
        const r = { id: `bt-${++seq}`, ref: `BKT-2026-000${health.tests.length + 1}`, ...args.p, notes: args.p.notes ?? null, duration_minutes: args.p.duration_minutes ?? null,
          recorded_by: 'me', recorded_by_email: 'joe@example.com', recorded_at: '2026-10-22T02:00:00Z' };
        health.tests.unshift(r); return route.fulfill(ok(r));
      }
      // AdminBatch005 — Dashboards
      case 'eab_admin_dash_growth': return dash.dash.includes(role) ? route.fulfill(ok(dash.growth(args))) : route.fulfill(denied);
      case 'eab_admin_dash_active': return dash.dash.includes(role) ? route.fulfill(ok(dash.active(args))) : route.fulfill(denied);
      case 'eab_admin_dash_retention': return dash.dash.includes(role) ? route.fulfill(ok(dash.retention(args, role))) : route.fulfill(denied);
      case 'eab_admin_dash_inactive': return dash.dash.includes(role) ? route.fulfill(ok(dash.inactive(args, role))) : route.fulfill(denied);
      case 'eab_admin_dash_devices':
        if (!dash.dash.includes(role) || (args.p_version && !dash.staff.includes(role))) return route.fulfill(denied);
        return route.fulfill(ok(dash.devices(args, role)));
      case 'eab_admin_dash_listings': return dash.dash.includes(role) ? route.fulfill(ok(dash.listings(args, role))) : route.fulfill(denied);
      case 'eab_admin_dash_usage': return dash.dash.includes(role) ? route.fulfill(ok(dash.usage(args))) : route.fulfill(denied);
      case 'eab_admin_dash_events': return dash.staff.includes(role) ? route.fulfill(ok(dash.events(args))) : route.fulfill(denied);
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

// ---------------- AdminBatch002 ----------------

test('admin: Login Security list, then suspend an agent with a reason (two steps), then re-activate', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  await page.getByTestId('tile-45').click();
  await page.getByTestId('agents-list').waitFor();
  assert.match(await page.getByTestId('security-counts').innerText(), /1 failed · 1 lockout/);
  assert.ok(calls.some(c => c.fn === 'eab_admin_agents' && c.args.p_filter === 'security'));
  await page.screenshot({ path: `${SHOTS}/08-login-security-phone.png`, fullPage: true });
  await page.getByTestId('agent-row').click();
  await page.getByTestId('account-box').waitFor();
  await page.getByTestId('act-suspended').click();
  const cont = page.getByRole('button', { name: 'Continue' });
  assert.ok(await cont.isDisabled(), 'reason required');
  await page.getByPlaceholder(/At least 5 characters/).fill('Misleading listing P1002');
  await cont.click();
  assert.equal(calls.filter(c => c.fn === 'eab_admin_set_account_status').length, 0, 'nothing sent before the second confirmation');
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('status-reason').waitFor();
  assert.equal(await page.getByTestId('agent-status').first().innerText(), 'Suspended');
  const set = calls.find(c => c.fn === 'eab_admin_set_account_status');
  assert.equal(set.args.p_status, 'suspended'); assert.equal(set.args.p_reason, 'Misleading listing P1002'); assert.equal(set.args.p_force_logout, true);
  await page.screenshot({ path: `${SHOTS}/09-agent-suspended-phone.png`, fullPage: true });
  // the "not active" list now shows the agent
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-47').click();
  await page.getByTestId('agents-list').waitFor();
  assert.match(await page.getByTestId('agents-list').innerText(), /Reason: Misleading listing P1002/);
  await page.getByTestId('agent-row').click();
  await page.getByTestId('act-reactivate').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Review finished, listing fixed');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('act-logout').waitFor();
  assert.equal(await page.getByTestId('agent-status').first().innerText(), 'Active');
  assert.equal(calls.filter(c => c.fn === 'eab_admin_set_account_status').pop().args.p_force_logout, false, 're-activating does not force a sign-out');
  // force sign-out
  await page.getByTestId('act-logout').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Phone reported stolen');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByText('Sign-out sent.').waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_force_logout').args.p_reason, 'Phone reported stolen');
  await ctx.close();
});

test('compliance: licence verification; no account actions; sign-in history and Terms tabs', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 1366 });
  await page.getByTestId('tile-52').click();
  await page.getByTestId('agents-list').waitFor();
  assert.match(await page.getByTestId('licence-tag').innerText(), /REN not verified/);
  await page.getByTestId('agent-row').click();
  await page.getByTestId('licence-box').waitFor();
  assert.equal(await page.getByTestId('account-box').count(), 0, 'compliance cannot suspend');
  await page.getByTestId('licence-verify').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Checked on the LPPEH register');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('licence-unverify').waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_verify_licence').args.p_verified, true);
  await page.getByTestId('tab-login').click();
  await page.getByTestId('login-table').waitFor();
  const t = await page.getByTestId('login-table').innerText();
  assert.match(t, /Locked out \(30 tries\)/); assert.match(t, /Sign-in failed/); assert.match(t, /3\.1579, 101\.7116/); assert.match(t, /no location/);
  await page.screenshot({ path: `${SHOTS}/10-sign-in-history-laptop.png`, fullPage: true });
  await page.getByTestId('tab-terms').click();
  await page.getByTestId('terms-table').waitFor();
  assert.match(await page.getByTestId('terms-table').innerText(), /Terms and Conditions\s+1\.1-draft\s+Accepted/);
  await ctx.close();
});

test('export includes sign-ins, Terms and the company name from settings', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-1').click();
  await page.getByTestId('agent-row').click();
  await page.getByTestId('export-xlsx').waitFor();
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
  const bytes = await (await import('node:fs/promises')).readFile(await xlsx.path());
  const text = bytes.toString('latin1');
  for (const sheet of ['Sign-in history', 'Terms and consent']) assert.ok(text.includes(`name="${sheet}"`), sheet);
  assert.ok(text.includes('Locked out (30 tries)'));
  assert.ok(calls.some(c => c.fn === 'eab_admin_settings'));
  assert.equal(calls.find(c => c.fn === 'eab_admin_export').args.p_detail.sign_ins, 3);
  await ctx.close();
});

test('System Settings: owner changes the support email with a reason; viewer can only look', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 390 });
  await page.getByTestId('tile-11').click();
  await page.getByTestId('settings').waitFor();
  assert.match(await page.getByTestId('settings').innerText(), /JSL Global Trading/);
  assert.match(await page.getByTestId('settings').innerText(), /Not set/);
  await page.getByTestId('settings-edit').click();
  await page.getByTestId('set-email').fill('not-an-email');
  assert.ok(await page.getByTestId('settings-save').isDisabled(), 'bad email refused');
  await page.getByTestId('set-email').fill('support@jslglobal.my');
  await page.getByTestId('settings-save').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Support mailbox ready');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByText('Settings saved.').waitFor();
  const set = calls.find(c => c.fn === 'eab_admin_set_settings');
  assert.deepEqual(set.args.p_patch, { support_email: 'support@jslglobal.my' }, 'only the changed field is sent');
  assert.match(await page.getByTestId('settings').innerText(), /support@jslglobal\.my/);
  await page.screenshot({ path: `${SHOTS}/11-settings-phone.png`, fullPage: true });
  await ctx.close();
  const v = await open({ role: 'viewer', width: 390 });
  await v.page.getByTestId('tile-11').click();
  await v.page.getByTestId('settings').waitFor();
  assert.equal(await v.page.getByTestId('settings-edit').count(), 0);
  assert.equal(await v.page.getByTestId('tile-45').count(), 0, 'viewer has no Login Security');
  await v.ctx.close();
});

// ---------------- AdminBatch003 ----------------

test('owner: new JPPH case → add agent → give regulator access → build Excel pack → stored in vault → download + check file', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-72').click();
  await page.getByTestId('case-new').click();
  await page.getByTestId('case-name').fill('Pn. Aminah, JPPH Kuala Lumpur');
  await page.getByTestId('case-ref').fill('JPPH/KL/2026/77');
  await page.getByTestId('case-desc').fill('All listings by Siti Agent from 1 Oct 2026, complaint about P1002');
  await page.getByTestId('case-deadline').fill('2026-11-03');
  await page.getByTestId('case-create').click();
  await page.getByText('No agents on this case yet.').waitFor();
  const created = calls.find(c => c.fn === 'eab_admin_case_create').args.p;
  assert.equal(created.requester_type, 'jpph'); assert.equal(created.deadline, '2026-11-03');
  assert.equal(await page.getByTestId('pack-pdf').isDisabled(), true, 'no pack without agents');
  // add agent
  await page.getByTestId('add-agent-q').fill('siti');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByTestId('add-agent-hit').click();
  await page.getByTestId('add-agent-go').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Named in the JPPH complaint');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByText('agent@example.com · period start to today').waitFor();
  // regulator access (owner only)
  await page.getByTestId('grant-email').fill('aminah.jpph@gmail.com');
  await page.getByTestId('grant-give').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Officer asked to view records herself');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('grant-revoke').waitFor();
  const grant = calls.find(c => c.fn === 'eab_admin_case_grant').args;
  assert.equal(grant.p_email, 'aminah.jpph@gmail.com');
  assert.ok(new Date(grant.p_expires_at) > new Date(), 'expiry in the future');
  // build Excel pack
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pack-xlsx').click()]);
  assert.match(dl.suggestedFilename(), /^CASE-2026-0001-EAB-20261021-000007\.xlsx$/);
  await page.getByTestId('case-msg').waitFor();
  assert.match(await page.getByTestId('case-msg').innerText(), /kept in the Document Vault · fingerprint/);
  const reg = calls.find(c => c.fn === 'eab_admin_pack_register').args.p;
  const bytes = await (await import('node:fs/promises')).readFile(await dl.path());
  const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  assert.equal(reg.sha256, sha, 'registered fingerprint = the downloaded file');
  assert.match(reg.content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(reg.kind, 'case_pack');
  const up = calls.find(c => c.fn === 'storage_upload');
  assert.ok(up.args.path.endsWith(`/${sha}`), 'uploaded to <pack id>/<sha256>');
  assert.equal(up.args.bytes, bytes.length);
  assert.ok(calls.findIndex(c => c.fn === 'storage_upload') < calls.findIndex(c => c.fn === 'eab_admin_pack_stored'), 'marked stored after upload');
  const text = bytes.toString('latin1');
  assert.ok(text.includes('name="Case"') && text.includes('CASE-2026-0001') && text.includes(reg.content_sha256), 'cover sheet with case and content fingerprint');
  await page.screenshot({ path: `${SHOTS}/12-case-laptop.png`, fullPage: true });
  // vault: list, download (fingerprint checked), check file genuine and changed
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-19').click();
  await page.getByTestId('packs-table').waitFor();
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pack-download').click()]);
  assert.equal(dl2.suggestedFilename(), dl.suggestedFilename());
  assert.match(await page.getByTestId('pack-msg').innerText(), /fingerprint checked/);
  await page.getByTestId('check-file-input').setInputFiles({ name: 'copy.xlsx', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByTestId('check-file-ok').waitFor();
  assert.match(await page.getByTestId('check-file-ok').innerText(), /Genuine and unchanged/);
  const changed = Buffer.from(bytes); changed[changed.length - 30] ^= 1;
  await page.getByTestId('check-file-input').setInputFiles({ name: 'edited.xlsx', mimeType: 'application/octet-stream', buffer: changed });
  await page.getByTestId('check-file-bad').waitFor();
  await page.screenshot({ path: `${SHOTS}/13-vault-laptop.png`, fullPage: true });
  await ctx.close();
});

test('compliance: can build packs but cannot give regulator access; closing a case needs a reason', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 390 });
  await page.getByTestId('tile-72').click();
  await page.getByTestId('case-new').click();
  await page.getByTestId('case-type').selectOption('pdpa');
  await page.getByTestId('case-name').fill('Siti Agent');
  await page.getByTestId('case-desc').fill('Agent wrote in asking for a copy of all her data');
  await page.getByTestId('case-create').click();
  await page.getByTestId('pack-box').waitFor();
  assert.equal(await page.getByTestId('grant-box').count(), 0, 'compliance cannot give regulator access');
  assert.match(await page.getByTestId('pack-box').innerText(), /agent’s data copy/);
  await page.getByTestId('case-mark-closed').click();
  assert.ok(await page.getByRole('button', { name: 'Continue' }).isDisabled());
  await page.getByPlaceholder(/At least 5 characters/).fill('Copy sent to the agent by email');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByText('Closed', { exact: true }).first().waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_case_update').args.p.status, 'closed');
  await page.screenshot({ path: `${SHOTS}/14-pdpa-case-closed-phone.png`, fullPage: true });
  await ctx.close();
});

test('regulator: sees only "My case", read-only, no export, no tiles for staff', async () => {
  const { page, ctx } = await open({ role: 'regulator', width: 390 });
  await page.getByTestId('tile-my-case').waitFor();
  assert.equal(await page.getByTestId('tile-14').count(), 0);
  await page.getByTestId('tile-my-case').click();
  await page.getByTestId('case-row').click();
  await page.getByTestId('case-agents').waitFor();
  assert.equal(await page.getByTestId('pack-box').count(), 0, 'no pack building');
  assert.equal(await page.getByTestId('grant-box').count(), 0);
  assert.equal(await page.getByTestId('add-agent').count(), 0);
  assert.equal(await page.getByTestId('case-remove-agent').count(), 0);
  await page.getByRole('button', { name: 'Siti Agent' }).click();
  await page.getByTestId('agent-status').first().waitFor();
  assert.equal(await page.getByTestId('export-pdf').count(), 0, 'regulator cannot export');
  assert.equal(await page.getByTestId('account-box').count(), 0);
  await page.screenshot({ path: `${SHOTS}/15-regulator-agent-phone.png`, fullPage: true });
  await ctx.close();
});

// ---------------- AdminBatch004: System Health ----------------

test('owner: System Health — database, storage boxes with forecast, plan limits change needs a reason', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-4').click();
  await page.getByTestId('db-tables').waitFor();
  assert.match(await page.getByTestId('health-db').innerText(), /13 \/ 60/);
  assert.match(await page.getByTestId('health-db').innerText(), /99\.87%/);
  await page.screenshot({ path: `${SHOTS}/16-health-db-laptop.png`, fullPage: true });
  await page.getByTestId('htab-storage').click();
  await page.getByTestId('meter-db').waitFor();
  assert.match(await page.getByTestId('meter-db').innerText(), /17\.0 MB/);
  assert.match(await page.getByTestId('meter-db').getByTestId('forecast').innerText(), /Growing about 1\.00 MB a day — full in about 483 days/);
  assert.match(await page.getByTestId('meter-files').getByTestId('forecast').innerText(), /Growing about/);
  await page.getByTestId('limits-edit').click();
  await page.getByTestId('limit-db').fill('8192');
  await page.getByTestId('limit-aws').selectOption('set_up');
  await page.getByTestId('limits-save').click();
  assert.ok(await page.getByRole('button', { name: 'Continue' }).isDisabled(), 'a reason is required');
  await page.getByPlaceholder(/At least 5 characters/).fill('Moved to the Supabase Pro plan');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByText('Limits saved.').waitFor();
  const set = calls.find(c => c.fn === 'eab_admin_set_health_limits');
  assert.deepEqual(set.args.p_patch, { db_limit_mb: 8192, aws_backup: 'set_up' });
  assert.equal(set.args.p_reason, 'Moved to the Supabase Pro plan');
  assert.match(await page.getByTestId('limits').innerText(), /8,192 MB/);
  await page.screenshot({ path: `${SHOTS}/17-health-storage-laptop.png`, fullPage: true });
  await ctx.close();
});

test('owner: backups — no restore test warning, record a test (kept for good), export the health report', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 390 });
  await page.getByTestId('tile-42').click();
  await page.getByTestId('box-supabase').waitFor();
  assert.match(await page.getByTestId('box-aws').innerText(), /Not set up yet/);
  assert.match(await page.getByTestId('restore-due').innerText(), /No restore test has been recorded yet/);
  await page.getByTestId('bt-add').click();
  assert.ok(await page.getByTestId('bt-save').isDisabled(), 'needs "what was checked"');
  await page.getByTestId('bt-what').fill('Restored the 21 Oct backup into a scratch project; opened 10 listings');
  await page.getByTestId('bt-mins').fill('40');
  await page.getByTestId('bt-save').click();
  await page.getByText(/cannot be changed or deleted afterwards/).waitFor();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('bt-list').waitFor();
  assert.match(await page.getByTestId('bt-list').innerText(), /BKT-2026-0001/);
  const add = calls.find(c => c.fn === 'eab_admin_backup_test_add');
  assert.equal(add.args.p.kind, 'restore_test'); assert.equal(add.args.p.result, 'pass'); assert.equal(add.args.p.duration_minutes, 40);
  await page.getByText(/Last restore test that passed/).waitFor();
  await page.screenshot({ path: `${SHOTS}/18-health-backups-phone.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('health-xlsx').click()]);
  assert.match(dl.suggestedFilename(), /^System-Health-EAB-20261021-000007\.xlsx$/);
  const exp = calls.find(c => c.fn === 'eab_admin_export');
  assert.equal(exp.args.p_kind, 'health_report'); assert.equal(exp.args.p_target, null);
  await ctx.close();
});

test('admin: sync failures per agent, push delivery, performance, problem reports; no export', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 1366 });
  await page.getByTestId('tile-43').click();
  await page.getByTestId('sync-agents').waitFor();
  assert.match(await page.getByTestId('health-sync').innerText(), /11 \(18%\)/);
  assert.equal(await page.getByTestId('health-pdf').count(), 0, 'admin cannot export');
  await page.screenshot({ path: `${SHOTS}/19-health-sync-laptop.png`, fullPage: true });
  await page.getByTestId('days').selectOption('7');
  await page.waitForFunction(() => true);
  await page.getByTestId('sync-agents').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_sync_health' && c.args.p_days === 7));
  await page.getByTestId('htab-push').click();
  await page.getByTestId('broadcasts').waitFor();
  assert.match(await page.getByTestId('broadcasts').innerText(), /OPR cut/);
  assert.match(await page.getByTestId('health-push').innerText(), /4 of 6/);
  await page.getByTestId('htab-performance').click();
  await page.getByTestId('startup').waitFor();
  assert.match(await page.getByTestId('health-performance').innerText(), /9\.1 s/);
  await page.getByTestId('htab-errors').click();
  await page.getByTestId('reports').waitFor();
  assert.match(await page.getByTestId('reports').innerText(), /Photo upload stuck/);
  assert.match(await page.getByTestId('failures').innerText(), /sync\.run/);
  await page.screenshot({ path: `${SHOTS}/20-health-errors-laptop.png`, fullPage: true });
  // the agent link opens the profile
  await page.getByRole('button', { name: 'agent@example.com' }).click();
  await page.getByTestId('agent-status').first().waitFor();
  await ctx.close();
});

test('viewer: health dashboards yes; agent lists, recording tests and changing limits no', async () => {
  const { page, ctx, calls } = await open({ role: 'viewer', width: 390 });
  await page.getByTestId('tile-4').waitFor();
  assert.equal(await page.getByTestId('tile-43').count(), 0, 'sync failures name agents');
  assert.equal(await page.getByTestId('tile-5').count(), 0, 'problem reports name agents');
  await page.getByTestId('tile-41').click();
  await page.getByTestId('meter-db').waitFor();
  assert.equal(await page.getByTestId('limits-edit').count(), 0);
  await page.getByTestId('htab-backups').click();
  await page.getByTestId('box-aws').waitFor();
  assert.equal(await page.getByTestId('bt-add').count(), 0);
  await page.getByTestId('htab-sync').click();
  await page.getByText(/shown to the Owner, Admin and Compliance only/).waitFor();
  assert.ok(!calls.some(c => c.fn === 'eab_admin_sync_health'), 'the agent list is not even asked for');
  await page.screenshot({ path: `${SHOTS}/21-health-viewer-phone.png`, fullPage: true });
  await ctx.close();
});

test('regulator: no System Health at all', async () => {
  const { page, ctx } = await open({ role: 'regulator', width: 390 });
  await page.getByTestId('tile-my-case').waitFor();
  assert.equal(await page.getByTestId('tile-4').count(), 0);
  assert.equal(await page.getByTestId('tile-42').count(), 0);
  await ctx.close();
});

// ---------------- AdminBatch005: Dashboards ----------------

test('owner: dashboards — sign-ups, active users, retention with at-risk agents, period filter, Excel report (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  for (const n of [23, 24, 25, 26, 20, 27, 29, 7, 59, 6, 62]) assert.ok(await page.getByTestId(`tile-${n}`).isEnabled(), `tile ${n}`);
  await page.getByTestId('tile-23').click();
  await page.getByTestId('growth-bars').waitFor();
  assert.match(await page.getByTestId('dash-growth').innerText(), /Agents now\s*6/);
  const g = calls.find(c => c.fn === 'eab_admin_dash_growth');
  assert.equal(g.args.p_bucket, 'day'); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(g.args.p_from));
  await page.screenshot({ path: `${SHOTS}/22-dash-growth-laptop.png`, fullPage: true });
  await page.getByTestId('range-365').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="range-text"]')?.textContent?.includes('365 days'));
  await page.getByTestId('growth-bars').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_growth' && c.args.p_bucket === 'month'), '12 months shows months');
  // custom range: a reversed period is refused before asking the database
  await page.getByTestId('range-custom').click();
  await page.getByTestId('range-from').fill('2026-10-20');
  await page.getByTestId('range-to').fill('2026-10-10');
  assert.ok(await page.getByTestId('range-apply').isDisabled());
  await page.getByText('The start date is after the end date.').waitFor();
  await page.getByTestId('range-to').fill('2026-10-21');
  await page.getByTestId('range-apply').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="range-text"]')?.textContent?.includes('2026-10-20 to 2026-10-21'));
  await page.getByTestId('dtab-active').click();
  await page.getByTestId('active-lines').waitFor();
  assert.match(await page.getByTestId('dash-active').innerText(), /Stickiness\s*40%/);
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_active' && c.args.p_from === '2026-10-20' && c.args.p_to === '2026-10-21'));
  await page.screenshot({ path: `${SHOTS}/23-dash-active-laptop.png`, fullPage: true });
  await page.getByTestId('dtab-retention').click();
  await page.getByTestId('at-risk').waitFor();
  assert.match(await page.getByTestId('at-risk').innerText(), /Siti Agent[\s\S]*Nothing for 14\+ days/);
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_retention' && c.args.p_device), 'the at-risk list call carries the device for the access log');
  await page.screenshot({ path: `${SHOTS}/24-dash-retention-laptop.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dash-xlsx').click()]);
  assert.match(dl.suggestedFilename(), /^Dashboards-EAB-20261021-000007\.xlsx$/);
  const exp = calls.find(c => c.fn === 'eab_admin_export');
  assert.equal(exp.args.p_kind, 'dashboards'); assert.equal(exp.args.p_target, null);
  assert.deepEqual(exp.args.p_detail, { from: '2026-10-20', to: '2026-10-21' });
  await ctx.close();
});

test('admin: inactive agents 30/60/90, versions with their agents, listings with stale list, pipeline lanes, feature usage drill-down; no export (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  await page.getByTestId('tile-26').click();
  await page.getByTestId('inactive-list').waitFor();
  assert.match(await page.getByTestId('inactive-list').innerText(), /Siti Agent[\s\S]*old@example\.com[\s\S]*Suspended/);
  assert.equal(await page.getByTestId('dash-xlsx').count(), 0, 'admin cannot export');
  assert.equal(await page.getByTestId('range').count(), 0, 'inactive has no period filter');
  await page.getByTestId('inactive-60').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="inactive-list"]')?.textContent?.includes('Siti Agent'));
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_inactive' && c.args.p_days === 60));
  await page.screenshot({ path: `${SHOTS}/25-dash-inactive-phone.png`, fullPage: true });
  await page.getByTestId('dtab-versions').click();
  await page.getByTestId('versions').waitFor();
  const v = await page.getByTestId('versions').innerText();
  assert.ok(v.indexOf('2.10.0') < v.indexOf('2.2.0'), 'newest version first');
  assert.match(await page.getByTestId('languages').innerText(), /Bahasa Melayu/);
  await page.getByTestId('versions').getByRole('listitem').first().click();
  await page.getByTestId('version-agents').getByText('Siti Agent').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_devices' && c.args.p_version === '2.10.0'));
  await page.screenshot({ path: `${SHOTS}/26-dash-versions-phone.png`, fullPage: true });
  await page.getByTestId('dtab-listings').click();
  await page.getByTestId('stale').waitFor();
  assert.match(await page.getByTestId('by-status').innerText(), /Rented - Pending TA Signing/);
  assert.match(await page.getByTestId('by-status').innerText(), /Booked - Pending Loan/);
  assert.match(await page.getByTestId('stale').innerText(), /P1001[\s\S]*113/);
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_listings' && c.args.p_stale_days === 60), '60 days (Joe)');
  await page.getByTestId('dtab-pipeline').click();
  await page.getByTestId('lane-rent').waitFor();
  assert.match(await page.getByTestId('lane-sale').innerText(), /Booked[\s\S]*Pending loan[\s\S]*SPA signed[\s\S]*Sold/);
  assert.match(await page.getByTestId('lane-rent').innerText(), /Rented - Pending TA Signing\s*1[\s\S]*Rented\s*0/);
  await page.screenshot({ path: `${SHOTS}/27-dash-pipeline-phone.png`, fullPage: true });
  await page.getByTestId('dtab-usage').click();
  await page.getByTestId('ranking').waitFor();
  assert.match(await page.getByTestId('ranking').innerText(), /Home[\s\S]*Listings/);
  assert.doesNotMatch(await page.getByTestId('ranking').innerText(), /Sync/, 'screens only by default');
  assert.match(await page.getByTestId('not-used').innerText(), /Developer dashboard/);
  await page.getByTestId('heatmap').waitFor();
  await page.getByTestId('ranking').getByRole('listitem').first().click();
  await page.getByTestId('events').getByText('Failed').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_dash_events' && c.args.p_kind === 'screen' && c.args.p_name === 'home' && c.args.p_device));
  await page.screenshot({ path: `${SHOTS}/28-dash-usage-phone.png`, fullPage: true });
  // an agent name opens the Agent Profile
  await page.getByTestId('events').getByRole('button', { name: 'Siti Agent' }).first().click();
  await page.getByTestId('agent-status').first().waitFor();
  await ctx.close();
});

test('viewer: dashboards with totals and charts only — no agent lists, no drill-down, nothing asked for by version', async () => {
  const { page, ctx, calls } = await open({ role: 'viewer', width: 390 });
  await page.getByTestId('tile-25').click();
  await page.getByTestId('dash-retention').waitFor();
  assert.match(await page.getByTestId('dash-retention').innerText(), /At risk of leaving\s*1/);
  assert.equal(await page.getByTestId('at-risk').count(), 0);
  await page.getByTestId('names-hidden').waitFor();
  await page.getByTestId('dtab-inactive').click();
  await page.getByTestId('dash-inactive').getByText(/No activity 30\+ days/).waitFor();
  assert.equal(await page.getByTestId('inactive-list').count(), 0);
  await page.getByTestId('dtab-versions').click();
  await page.getByTestId('versions').waitFor();
  assert.equal(await page.getByTestId('versions').locator('button').count(), 0, 'versions cannot be opened');
  await page.getByTestId('dtab-listings').click();
  await page.getByTestId('by-status').waitFor();
  assert.equal(await page.getByTestId('stale').count(), 0);
  await page.getByTestId('dtab-usage').click();
  await page.getByTestId('ranking').waitFor();
  assert.equal(await page.getByTestId('ranking').locator('button').count(), 0, 'no drill-down');
  assert.equal(await page.getByTestId('dash-pdf').count(), 0);
  assert.ok(!calls.some(c => c.fn === 'eab_admin_dash_events' || (c.fn === 'eab_admin_dash_devices' && c.args.p_version)));
  await page.screenshot({ path: `${SHOTS}/29-dash-viewer-phone.png`, fullPage: true });
  await ctx.close();
});

test('regulator: no dashboards', async () => {
  const { page, ctx } = await open({ role: 'regulator', width: 390 });
  await page.getByTestId('tile-my-case').waitFor();
  for (const n of [23, 24, 26, 7, 62]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await ctx.close();
});
