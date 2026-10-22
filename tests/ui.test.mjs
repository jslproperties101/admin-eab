// Screen tests: the built app (dist/) in a real Chromium, with a FAKE Supabase that answers like the eab_admin_*
// functions. Nothing here talks to a real database. Screenshots go to tests/screens/ (phone 390px and laptop 1366px).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// AdminBatch006 — News (MainForAdmin-D functions), tickets, flags, overview: a small in-memory fake.
function opsFake() {
  const EVERY = '00000000-0000-0000-0000-000000000000';
  const staff = ['owner', 'admin', 'compliance'], view = [...staff, 'viewer'], edit = ['owner', 'admin'];
  let n = 0; const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const now = '2026-10-22T04:00:00Z';
  const item = (p) => ({ id: id(), title_bm: null, title_zh: null, body_en: null, body_bm: null, body_zh: null, image_url: null, link_url: null, pdf_url: null,
    push_alert: false, display: null, project: null, audience: 'all', status: 'draft', published_at: null, expires_at: null, created_by: 'me',
    created_at: now, updated_at: now, group_ids: [], opened: 0, acknowledged: 0, dismissed: 0, code_grants: 0, ...p });
  const items = [
    item({ kind: 'news', title_en: 'OPR cut to 2.75%', body_en: 'Bank Negara cut the OPR.', status: 'published', published_at: '2026-10-20T01:00:00Z', created_at: '2026-10-20T00:00:00Z', opened: 3, push_alert: true }),
    item({ kind: 'news', title_en: 'New stamp duty rules', status: 'published', published_at: '2026-10-21T01:00:00Z', created_at: '2026-10-21T00:00:00Z' }),
    item({ kind: 'project', title_en: 'Residensi Gold', audience: 'codes', status: 'published', project: { developer: 'JSL Dev', location: 'Shah Alam' } }),
    item({ kind: 'announcement', title_en: 'Office closed on Deepavali', display: 'banner', status: 'draft' }),
  ];
  const groups = [{ id: EVERY, name: 'Everyone', filters: {}, priority: 1000, active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', agents: 6 },
    { id: id(), name: 'BM speakers', filters: { languages: ['bm'] }, priority: 5, active: true, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', agents: 2 }];
  const order = new Map([[EVERY, [{ item_id: items[2].id, position: 1 }]]]);
  const codes = [{ code: 'ABCD234XYZ', label: 'Team Selangor', item_ids: [items[2].id], active: true, expires_at: null, max_uses: 10, uses: 1, created_at: now, agents: 1 }];
  const grants = [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', item_id: items[2].id, title: 'Residensi Gold', granted_at: now, code: 'ABCD234XYZ' }];
  const pushes = [{ item_id: items[0].id, status: 'queued', queued_at: now, started_at: null, finished_at: null, targeted: null, sent: null, failed: null, no_phone: null, delivered: 0, opened: 0, kind: 'news', title_en: items[0].title_en }];
  const tickets = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', description: 'Photo upload stuck at 90%',
    screenshot_path: `${AGENT}/aaaaaaaa-0000-4000-8000-000000000001.jpg`, app_version: '2.2.0', platform: 'android', language: 'en', screen: 'listing-form', status: 'new', created_at: '2026-10-21T08:00:00Z', history: [] }];
  const flags = [];
  const master = () => ({ checked_at: now, today: '2026-10-22', agents: 6, new_7d: 2, active_today: 2, active_7d: 4, active_30d: 4, at_risk: 1, live_now: 1,
    listings: 9, stale: 0, closed_30d: 1, db_bytes: 17 * 1048576, db_limit_bytes: 500 * 1048576, files_bytes: 26 * 1048576, files_limit_bytes: 1024 * 1048576,
    aws_backup: 'not_set_up', last_restore_pass: null, sync_runs_7d: 98, sync_fails_7d: 11, tickets_new: tickets.filter(t => t.status === 'new').length,
    tickets_open: tickets.filter(t => ['new', 'seen'].includes(t.status)).length, pushes_waiting: pushes.filter(p => p.status === 'queued').length, posts_live: 3,
    maintenance_on: false, maintenance_back_at: null, min_version: null, min_version_mode: 'soft', flags_on: flags.filter(f => f.enabled).length, licences_unverified: 0,
    accounts_not_active: 1, active_by_day: Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(9 + i).padStart(2, '0')}`, agents: i > 9 ? 2 : 0 })) });
  const row = t => ({ ...t, has_screenshot: !!t.screenshot_path, notes: t.history.filter(h => h.kind === 'note').length, last_activity: t.created_at });
  return { EVERY, staff, view, edit, items, groups, order, codes, grants, pushes, tickets, flags, master, row, id, now, uploads: [], sends: [] };
}

// AdminBatch007 — compliance core fake: PDPA requests, complaints, holds, licence expiry, tags / notes, retention.
function complianceFake() {
  let n = 0; const now = '2026-10-22T04:00:00Z';
  const st = { pdpa: [], complaints: [], holds: [], tags: [], notes: [], reviews: [], expires: '2026-11-05' };
  const ev = (kind, body, from, to) => ({ id: ++n, kind, body, from_status: from ?? null, to_status: to ?? null, by_user: 'me', by_email: 'joe@example.com', at: now });
  const onHold = u => st.holds.some(h => h.agent_user === u && !h.released_at);
  const pjson = r => ({ ...r, agent_email: r.agent_user ? 'agent@example.com' : null, agent_name: r.agent_user ? 'Siti Agent' : null, agent_on_hold: onHold(r.agent_user),
    days_open: ['open', 'in_progress'].includes(r.status) ? 3 : null, summary: r.details.slice(0, 160) });
  const cjson = c => ({ ...c, agent_email: c.agent_user ? 'agent@example.com' : null, agent_name: c.agent_user ? 'Siti Agent' : null,
    agent_complaints: st.complaints.filter(x => x.agent_user && x.agent_user === c.agent_user).length, summary: c.details.slice(0, 160) });
  return { st, ev, onHold, pjson, cjson, now, id: () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`, next: () => ++n };
}

/** AdminBatch008 fake reports: the catalogue per role, a small report runner, shared saved reports, Board numbers, an audit year. */
function reportsFake() {
  const now = '2026-10-23T03:00:00Z';
  const P = true;
  const catalog = {
    agents: { label: 'Agents', roles: ['owner', 'admin', 'compliance', 'viewer'], date: 'joined', columns: { email: { t: 'text', p: P, l: 'Email' }, name: { t: 'text', p: P, l: 'Name' },
      joined: { t: 'date', l: 'Joined' }, status: { t: 'text', l: 'Account status' }, platform: { t: 'text', l: 'Platform' }, listings: { t: 'num', l: 'Listings' } } },
    listings: { label: 'Listings', roles: ['owner', 'admin', 'compliance', 'viewer'], date: 'created', columns: { agent_email: { t: 'text', p: P, l: 'Agent email' },
      ref: { t: 'text', l: 'Reference' }, state: { t: 'text', l: 'State' }, status: { t: 'text', l: 'Status' }, asking_price: { t: 'num', l: 'Asking price (RM)' },
      created: { t: 'date', l: 'Created' }, deleted: { t: 'bool', l: 'Deleted' } } },
    complaints: { label: 'Complaints', roles: ['owner', 'admin', 'compliance'], date: 'received_on', columns: { ref: { t: 'text', l: 'Reference' }, category: { t: 'text', l: 'About' } } },
    pdpa: { label: 'PDPA requests', roles: ['owner', 'compliance'], date: 'received_on', columns: { ref: { t: 'text', l: 'Reference' }, kind: { t: 'text', l: 'Kind' } } },
  };
  const rows = [
    { agent_email: 'agent@example.com', ref: 'P1001', state: 'Selangor', status: 'available', asking_price: 480000, created: '2026-10-02', deleted: false },
    { agent_email: 'agent@example.com', ref: 'P1002', state: 'Selangor', status: 'sold', asking_price: 900000, created: '2026-10-05', deleted: false },
    { agent_email: 'ali@example.com', ref: 'P2001', state: 'Johor', status: 'available', asking_price: 350000, created: '2026-09-20', deleted: false },
  ];
  const saved = [{ id: 'sr-1', name: 'Listings by state (Ali)', source: 'listings', spec: { source: 'listings', group_by: ['state'], measure: 'count' },
    created_by: 'ali', created_by_email: 'ali@example.com', created_at: now, updated_by: null, updated_at: now }];
  const nums = k => ({ from: k ? '2026-09-01' : '2026-08-01', to: k ? '2026-09-30' : '2026-08-31',
    agents: { total: 40 + k * 5, new: 3 + k * 2, active: 20 + k, not_active_now: 2, status_changes: k },
    licences: { total: 30, verified: 25, expired_at_end: k, expiring_60_after: 4, no_expiry_date: 3 },
    listings: { new: 10 + k, live_now: 120, sold: 2 + k, rented: 1, by_status_now: { available: 90, sold: 30 }, by_state_now: [{ state: 'Selangor', listings: 70 }] },
    complaints: { received: 2 * k, by_category: k ? { fees: 2 } : {}, resolved: 1, open_at_end: k },
    pdpa: { received: 3, by_kind: { access: 2, deletion: 1 }, with_deadline: 2, answered_in_21: 2 - k, late: k },
    tickets: { received: 5, fixed_or_closed: 4 }, cases: { opened: 1, closed: k, by_requester: { police: 1 }, packs: 2 },
    admin: { actions: 50 + k, exports: 4, top_actions: [{ action: 'account_status', n: 3 + k }] } });
  const bundle = { year: 2026, from: '2026-01-01', to: '2026-12-31', made_at: now, cap: 50000,
    chain: { actions: { ok: true, checked: 120, first_bad_seq: null }, access: { ok: true, checked: 900, first_bad_seq: null } }, counts: { actions: 1, access: 1 },
    actions: [{ seq: 1, at: now, admin_user: 'me', admin_email: 'joe@example.com', admin_role: 'owner', action: 'legal_hold_placed', target_user: AGENT, target_ref: 'h', reason: 'Police', device: 'web', hash: 'h1' }],
    access: [{ seq: 9, at: now, admin_user: 'me', admin_email: 'joe@example.com', admin_role: 'owner', kind: 'export', target_user: null, target_ref: 'EAB-1', device: 'web', hash: 'h9' }],
    backup_tests: [{ id: 'b', ref: 'BT-2026-0001', tested_on: '2026-09-01', target: 'supabase', kind: 'restore_test', result: 'pass', what: 'Restored to a test project', duration_minutes: 20, notes: null, recorded_by: 'me', recorded_by_email: 'joe@example.com', recorded_at: now }],
    cases: [], vault: [], pdpa: [], complaints: [], holds: [], retention_reviews: [] };
  return { now, catalog, rows, saved, nums, bundle, board: ['owner', 'compliance'], staff: ['owner', 'admin', 'compliance'] };
}

// AdminBatch008 — broadcasts, weekly report, Team Workspaces, To-Do & Calendar. Answers like the 008 functions; the
// "server functions" send-broadcast and weekly-report are faked too (no Resend, no WhatsApp, no PDF from the server).
function b8Fake() {
  let n = 0; const now = '2026-10-22T04:00:00Z';
  const id = () => `bbbbbbbb-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const agents = [
    { user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', phone: '60123456789', lang: 'bm', consent: true, active: true },
    { user_id: 'b2', email: 'ali@example.com', name: 'Ali', phone: null, lang: 'en', consent: false, active: true },
    { user_id: 'b3', email: 'gone@example.com', name: 'Banned Bob', phone: '60199999999', lang: 'en', consent: true, active: false },
  ];
  const st = { broadcasts: [], recipients: [], settings: { enabled: false, weekday: 1, hour: 8, recipients: [], updated_by: null, updated_at: now }, runs: [],
    tasks: [{ id: id(), owner_user: 'other', shared: true, title: 'Renew Supabase plan', notes: null, due_on: '2026-10-20', done: false, done_at: null, done_by: null,
      created_at: '2026-10-19T00:00:00Z', updated_at: now, owner_email: 'kim@example.com', done_by_email: null }], events: [], sends: [], reportRuns: 0 };
  const cand = (b, a) => !a.active ? 'skipped_not_active' : b.kind === 'news' && !a.consent ? 'skipped_no_consent'
    : (b.channel === 'email' ? !a.email : !a.phone) ? 'skipped_no_address' : 'pending';
  const counts = b => st.recipients.filter(r => r.broadcast_id === b.id).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  const json = b => ({ ...b, created_by_email: 'joe@example.com', queued_by_email: b.queued_by ? 'joe@example.com' : null, counts: counts(b) });
  const detail = b => ({ ...json(b), recipients: st.recipients.filter(r => r.broadcast_id === b.id) });
  const admins = [{ user_id: 'me', email: 'joe@example.com', role: 'owner' }, { user_id: 'c9', email: 'nur@example.com', role: 'compliance' }];
  const settingsJson = () => ({ ...st.settings, recipient_emails: admins.filter(a => st.settings.recipients.includes(a.user_id)), can_receive: admins });
  const workspaces = { workspaces: [{ id: 'w1', name: 'Siti', created_at: '2026-10-01T00:00:00Z', owner_email: 'agent@example.com', owner_name: 'Siti Agent', members: 1, records: 5, listings: 2 }],
    teams: [{ id: 't1', created_at: '2026-10-10T00:00:00Z', ended_at: null, end_reason: null, leader_email: 'agent@example.com', leader_name: 'Siti Agent',
      members: [{ email: 'ali@example.com', name: 'Ali', joined_at: '2026-10-11T00:00:00Z', left_at: null }] }] };
  const workspace = { id: 'w1', name: 'Siti', created_at: '2026-10-01T00:00:00Z', owner_user: AGENT, owner_email: 'agent@example.com', owner_name: 'Siti Agent',
    members: [{ user_id: AGENT, email: 'agent@example.com', role: 'owner', active: true, joined_at: '2026-10-01T00:00:00Z' }], by_kind: { properties: 2, contacts: 3 }, deleted: 1 };
  return { st, id, now, agents, cand, json, detail, settingsJson, workspaces, workspace, admins };
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
  const ops = opsFake();
  const cmp = complianceFake();
  const rep = reportsFake();
  const b8 = b8Fake();
  settings = { ...settings, min_version: null, min_version_mode: 'soft', update_url: null, maintenance_on: false, maintenance_message_en: null, maintenance_message_bm: null, maintenance_message_zh: null, maintenance_back_at: null };
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
    if (url.includes('/storage/v1/object/eab-feed-media/')) {
      if (!ops.edit.includes(role)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
      const path = url.split('/eab-feed-media/')[1];
      ops.uploads.push({ path, type: route.request().headers()['content-type'], bytes: route.request().postDataBuffer()?.length ?? 0 });
      return route.fulfill(ok({ Key: `eab-feed-media/${path}` }));
    }
    if (url.includes('/storage/v1/object/public/eab-feed-media/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    if (url.includes('/storage/v1/object/authenticated/bug-reports/')) {
      if (!ops.staff.includes(role)) return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    }
    if (url.includes('/functions/v1/send-push')) {
      if (!ops.edit.includes(role)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'not allowed' }) });
      const body = route.request().postDataJSON() ?? {};
      ops.sends.push(body);
      const todo = ops.pushes.filter(p => p.status === 'queued' && (!body.item_id || p.item_id === body.item_id));
      for (const p of todo) Object.assign(p, { status: 'done', started_at: ops.now, finished_at: ops.now, targeted: 6, sent: 4, failed: 0, no_phone: 2, delivered: 2, opened: 1 });
      return route.fulfill(ok({ items: todo.map(p => ({ item_id: p.item_id, targeted: 6, sent: 4, failed: 0, no_phone: 2 })) }));
    }
    if (url.includes('/functions/v1/send-broadcast')) {
      if (!['owner', 'admin'].includes(role)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'not allowed' }) });
      const body = route.request().postDataJSON() ?? {}; b8.st.sends.push(body);
      const bc = b8.st.broadcasts.find(x => x.id === body.broadcast_id);
      if (bc.channel === 'whatsapp') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'WhatsApp Business not set up: use tap-to-send' }) });
      let sent = 0, failed = 0;
      for (const r of b8.st.recipients.filter(x => x.broadcast_id === bc.id && x.status === 'pending')) {
        if (r.address === 'agent@example.com') { Object.assign(r, { status: 'sent', sent_at: b8.now }); sent++; }
        else { Object.assign(r, { status: 'failed', error: 'Resend 403: You can only send testing emails to your own email address' }); failed++; }
      }
      bc.status = 'done'; bc.finished_at = b8.now;
      return route.fulfill(ok({ broadcast_id: bc.id, sent, failed, status: 'done', more: false }));
    }
    if (url.includes('/functions/v1/weekly-report')) {
      if (!['owner', 'compliance'].includes(role)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'not allowed' }) });
      const pdf = Buffer.from(`%PDF-1.7 fake report ${b8.st.reportRuns}`); const sha = createHash('sha256').update(pdf).digest('hex'); const rid = b8.id();
      const run = { id: rid, ref: `RPT-2026-W43-M${++b8.st.reportRuns}`, period_from: '2026-10-12', period_to: '2026-10-18', trigger: 'manual', status: 'stored',
        file_name: 'EAB-weekly-RPT-2026-W43.pdf', sha256: sha, bytes: 1234, emailed_to: [], error: 'email not set up (kept in the vault only)',
        started_by: 'me', started_by_email: 'joe@example.com', created_at: b8.now, finished_at: b8.now };
      b8.st.runs.unshift(run); objects.set(`reports/${rid}/${sha}`, pdf);
      return route.fulfill(ok({ run }));
    }
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
      // AdminBatch006 — News (MainForAdmin-D), tickets, flags, overview
      case 'eab_admin_feed_list': return ops.view.includes(role) ? route.fulfill(ok(ops.items.filter(i => !args.p_kind || i.kind === args.p_kind))) : route.fulfill(denied);
      case 'eab_admin_feed_save': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        if (!args.p_reason) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'a reason is required' }) });
        const p = args.p_item; let it = ops.items.find(i => i.id === p.id);
        if (!it) { it = { id: ops.id(), status: 'draft', published_at: null, created_by: 'me', created_at: ops.now, opened: 0, acknowledged: 0, dismissed: 0, code_grants: 0 }; ops.items.unshift(it); }
        Object.assign(it, p, { id: it.id, updated_at: ops.now });
        return route.fulfill(ok(it));
      }
      case 'eab_admin_feed_set_status': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        const it = ops.items.find(i => i.id === args.p_item);
        Object.assign(it, { status: args.p_status, published_at: args.p_status === 'published' ? (it.published_at ?? ops.now) : it.published_at });
        if (args.p_status === 'published' && it.push_alert && !ops.pushes.some(p => p.item_id === it.id))
          ops.pushes.unshift({ item_id: it.id, status: 'queued', queued_at: ops.now, started_at: null, finished_at: null, targeted: null, sent: null, failed: null, no_phone: null, delivered: 0, opened: 0, kind: it.kind, title_en: it.title_en });
        return route.fulfill(ok(it));
      }
      case 'eab_admin_group_list': return ops.view.includes(role) ? route.fulfill(ok(ops.groups)) : route.fulfill(denied);
      case 'eab_admin_group_preview': return ops.view.includes(role) ? route.fulfill(ok({ agents: (args.p_filters?.emails?.length ?? 0) + (args.p_filters?.languages?.length ? 2 : 0) || 6, of: 6 })) : route.fulfill(denied);
      case 'eab_admin_group_save': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        let g = ops.groups.find(x => x.id === args.p_group.id);
        if (!g) { g = { id: ops.id(), created_at: ops.now, active: true, agents: 1 }; ops.groups.push(g); }
        Object.assign(g, args.p_group, { updated_at: ops.now });
        return route.fulfill(ok(g));
      }
      case 'eab_admin_feed_order_get': return ops.view.includes(role) ? route.fulfill(ok(ops.order.get(args.p_group) ?? [])) : route.fulfill(denied);
      case 'eab_admin_feed_order_set':
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        ops.order.set(args.p_group, args.p_items.map((x, i) => ({ item_id: x, position: i + 1 })));
        return route.fulfill(ok(args.p_items.length));
      case 'eab_admin_code_list': return ops.view.includes(role) ? route.fulfill(ok(ops.codes)) : route.fulfill(denied);
      case 'eab_admin_code_create': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        const c = { code: 'NEWC0DE234', label: args.p_label || null, item_ids: args.p_items, active: true, expires_at: args.p_expires_at, max_uses: args.p_max_uses, uses: 0, created_at: ops.now, agents: 0 };
        ops.codes.unshift(c); return route.fulfill(ok(c));
      }
      case 'eab_admin_code_disable': { if (!ops.edit.includes(role)) return route.fulfill(denied); const c = ops.codes.find(x => x.code === args.p_code); c.active = false; return route.fulfill(ok(c)); }
      case 'eab_admin_code_grants': return ops.staff.includes(role) ? route.fulfill(ok(ops.grants.filter(g => g.code === args.p_code))) : route.fulfill(denied);
      case 'eab_admin_code_revoke': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        const i = ops.grants.findIndex(g => g.user_id === args.p_user && g.item_id === args.p_item); if (i >= 0) ops.grants.splice(i, 1);
        return route.fulfill(ok(i >= 0));
      }
      case 'eab_admin_push_list': return ops.view.includes(role) ? route.fulfill(ok(ops.pushes)) : route.fulfill(denied);
      case 'eab_admin_tickets': {
        if (!ops.staff.includes(role)) return route.fulfill(denied);
        const st = args.p_status;
        const list = ops.tickets.filter(t => !st || t.status === st || (st === 'open' && ['new', 'seen'].includes(t.status)));
        const counts = {}; for (const t of ops.tickets) counts[t.status] = (counts[t.status] ?? 0) + 1;
        return route.fulfill(ok({ counts, tickets: list.map(ops.row) }));
      }
      case 'eab_admin_ticket': return ops.staff.includes(role) ? route.fulfill(ok(ops.tickets.find(t => t.id === args.p_id))) : route.fulfill(denied);
      case 'eab_admin_ticket_set_status': case 'eab_admin_ticket_note': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        const t = ops.tickets.find(x => x.id === args.p_id);
        if (fn === 'eab_admin_ticket_set_status') { t.history.push({ id: t.history.length + 1, report_id: t.id, kind: 'status', body: args.p_note, from_status: t.status, to_status: args.p_status, by_user: 'me', by_email: 'joe@example.com', at: ops.now }); t.status = args.p_status; }
        else t.history.push({ id: t.history.length + 1, report_id: t.id, kind: 'note', body: args.p_note, from_status: null, to_status: null, by_user: 'me', by_email: 'joe@example.com', at: ops.now });
        return route.fulfill(ok(t));
      }
      case 'eab_admin_flags': return ops.view.includes(role) ? route.fulfill(ok(ops.flags)) : route.fulfill(denied);
      case 'eab_admin_flag_save': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        let f = ops.flags.find(x => x.key === args.p_flag.key);
        if (!f) { f = { key: args.p_flag.key, enabled: false, audience: 'all', group_ids: [], description: null, created_at: ops.now, updated_by: 'me' }; ops.flags.push(f); }
        Object.assign(f, args.p_flag, { updated_at: ops.now }); return route.fulfill(ok(f));
      }
      case 'eab_admin_dash_master': return ops.view.includes(role) ? route.fulfill(ok(ops.master())) : route.fulfill(denied);
      case 'eab_admin_dash_top_agents': return ops.staff.includes(role) ? route.fulfill(ok({ from: args.p_from, to: args.p_to, agents: [
        { user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', listings: 5, new_listings: 2, sold: 1, rented: 1, closed: 2, active_days: 4, actions: 180 },
        { user_id: 'b2', email: 'ali@example.com', name: 'Ali', listings: 3, new_listings: 1, sold: 0, rented: 0, closed: 0, active_days: 2, actions: 40 }] })) : route.fulfill(denied);
      case 'eab_admin_live_users': return ops.view.includes(role) ? route.fulfill(ok({ minutes: args.p_minutes, checked_at: ops.now, count: 1, names_hidden: !ops.staff.includes(role),
        by_screen: [{ screen: 'listing-form', agents: 1 }],
        agents: ops.staff.includes(role) ? [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', last_at: ops.now, screen: 'listing-form', app_version: '2.2.0', platform: 'android', device: 'SM-S918B' }] : null })) : route.fulfill(denied);
      // AdminBatch007 — compliance core
      case 'eab_admin_pdpa_list': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const f = args.p_status; const counts = {}; for (const r of cmp.st.pdpa) counts[r.status] = (counts[r.status] ?? 0) + 1;
        return route.fulfill(ok({ counts, requests: cmp.st.pdpa.filter(r => !f || r.status === f || (f === 'active' && ['open', 'in_progress'].includes(r.status))).map(cmp.pjson) }));
      }
      case 'eab_admin_pdpa_get': return ['owner', 'compliance'].includes(role) ? route.fulfill(ok(cmp.pjson(cmp.st.pdpa.find(r => r.id === args.p_id)))) : route.fulfill(denied);
      case 'eab_admin_pdpa_create': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const r = { id: cmp.id(), ref: `PDPA-2026-000${cmp.st.pdpa.length + 1}`, status: 'open', decision: null, decided_on: null, supplied_on: null, outcome: null,
          case_id: null, created_by: 'me', created_at: cmp.now, updated_at: cmp.now, requester_contact: null, agent_user: null, ...args.p, history: [cmp.ev('created', null, null, 'open')] };
        cmp.st.pdpa.unshift(r); return route.fulfill(ok(cmp.pjson(r)));
      }
      case 'eab_admin_pdpa_update': case 'eab_admin_pdpa_note': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const r = cmp.st.pdpa.find(x => x.id === args.p_id);
        if (fn === 'eab_admin_pdpa_note') { r.history.push(cmp.ev('note', args.p_note)); return route.fulfill(ok(cmp.pjson(r))); }
        if (args.p.status === 'done' && r.kind === 'deletion' && cmp.onHold(r.agent_user))
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'this agent is on legal hold: a deletion request cannot be marked done' }) });
        const from = r.status; Object.assign(r, args.p);
        r.history.push(cmp.ev(r.status !== from ? 'status' : 'updated', args.p_note, r.status !== from ? from : null, r.status !== from ? r.status : null));
        return route.fulfill(ok(cmp.pjson(r)));
      }
      case 'eab_admin_complaints': {
        if (!ops.staff.includes(role)) return route.fulfill(denied);
        const f = args.p_status; const counts = {}, by = {};
        for (const c of cmp.st.complaints) { counts[c.status] = (counts[c.status] ?? 0) + 1; by[c.category] = (by[c.category] ?? 0) + 1; }
        return route.fulfill(ok({ counts, by_category: by, complaints: cmp.st.complaints.filter(c => (!f || c.status === f || (f === 'active' && ['open', 'investigating'].includes(c.status))) && (!args.p_agent || c.agent_user === args.p_agent)).map(cmp.cjson) }));
      }
      case 'eab_admin_complaint_get': return ops.staff.includes(role) ? route.fulfill(ok(cmp.cjson(cmp.st.complaints.find(c => c.id === args.p_id)))) : route.fulfill(denied);
      case 'eab_admin_complaint_create': {
        if (!ops.staff.includes(role)) return route.fulfill(denied);
        const c = { id: cmp.id(), ref: `CMP-2026-000${cmp.st.complaints.length + 1}`, status: 'open', outcome: null, case_id: null, created_by: 'me', created_at: cmp.now, updated_at: cmp.now,
          complainant_contact: null, listing_ref: null, agent_user: null, ...args.p, history: [cmp.ev('created', null, null, 'open')] };
        cmp.st.complaints.unshift(c); return route.fulfill(ok(cmp.cjson(c)));
      }
      case 'eab_admin_complaint_update': case 'eab_admin_complaint_note': {
        if (!ops.staff.includes(role)) return route.fulfill(denied);
        const c = cmp.st.complaints.find(x => x.id === args.p_id);
        if (fn === 'eab_admin_complaint_note') { c.history.push(cmp.ev('note', args.p_note)); return route.fulfill(ok(cmp.cjson(c))); }
        const from = c.status; Object.assign(c, args.p);
        c.history.push(cmp.ev(c.status !== from ? 'status' : 'updated', args.p_note, c.status !== from ? from : null, c.status !== from ? c.status : null));
        return route.fulfill(ok(cmp.cjson(c)));
      }
      case 'eab_admin_holds': return ops.staff.includes(role) ? route.fulfill(ok(cmp.st.holds.filter(h => !args.p_active || !h.released_at)
        .map(h => ({ ...h, agent_email: 'agent@example.com', agent_name: 'Siti Agent', case_no: null })))) : route.fulfill(denied);
      case 'eab_admin_hold_place': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const h = { id: cmp.id(), agent_user: args.p_agent, reason: args.p_reason, case_id: args.p_case, placed_by: 'me', placed_by_email: 'joe@example.com', placed_at: cmp.now,
          released_by: null, released_by_email: null, released_at: null, release_reason: null };
        cmp.st.holds.unshift(h); return route.fulfill(ok(h));
      }
      case 'eab_admin_hold_release': {
        if (!['owner', 'compliance'].includes(role)) return route.fulfill(denied);
        const h = cmp.st.holds.find(x => x.id === args.p_id); Object.assign(h, { released_at: cmp.now, release_reason: args.p_reason, released_by_email: 'joe@example.com' });
        return route.fulfill(ok(h));
      }
      case 'eab_admin_licence_expiry': return ops.staff.includes(role) ? route.fulfill(ok({ today: '2026-10-22', within: args.p_within,
        counts: { expired: 0, in_7: 0, in_30: 1, in_60: 1, no_date: 1, licences: 2 },
        agents: [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', type: 'REN', number: '12345', verified: true, expires_on: cmp.st.expires, days_left: 14 },
          { user_id: 'b2', email: 'ali@example.com', name: 'Ali', type: 'REA', number: 'E 777', verified: false, expires_on: null, days_left: null }] })) : route.fulfill(denied);
      case 'eab_admin_set_licence_expiry': if (!ops.staff.includes(role)) return route.fulfill(denied); cmp.st.expires = args.p_expires; return route.fulfill(ok({ expires_on: args.p_expires }));
      case 'eab_admin_agent_internal': return ops.staff.includes(role) ? route.fulfill(ok({ tags: [...cmp.st.tags].sort(), notes: cmp.st.notes, holds: cmp.st.holds.filter(h => h.agent_user === args.p_user),
        on_hold: cmp.onHold(args.p_user), complaints: cmp.st.complaints.length, complaints_active: cmp.st.complaints.filter(c => c.status === 'open').length,
        pdpa: cmp.st.pdpa.length, licence_expires_on: cmp.st.expires, licence_number: 'REN 12345' })) : route.fulfill(denied);
      case 'eab_admin_agent_tag': {
        if (!ops.staff.includes(role)) return route.fulfill(denied);
        cmp.st.tags = args.p_add ? [...new Set([...cmp.st.tags, args.p_tag])] : cmp.st.tags.filter(t => t !== args.p_tag); return route.fulfill(ok(cmp.st.tags));
      }
      case 'eab_admin_agent_note': { if (!ops.staff.includes(role)) return route.fulfill(denied); const nn = { id: cmp.next(), user_id: args.p_user, body: args.p_note, by_user: 'me', by_email: 'joe@example.com', at: cmp.now }; cmp.st.notes.unshift(nn); return route.fulfill(ok(nn)); }
      case 'eab_admin_retention': return ['owner', 'compliance'].includes(role) ? route.fulfill(ok({ today: '2026-10-22', cutoff: '2019-10-22', deletion_enabled: false,
        counts: { records: 3, records_on_hold: 1, versions: 4, sign_ins: 10, problem_reports: 0, usage_days: 0 },
        next_year: { records: 5, records_on_hold: 1, versions: 6, sign_ins: 20, problem_reports: 0, usage_days: 0 },
        agents: [{ user_id: AGENT, email: 'agent@example.com', name: 'Siti Agent', records: 3, oldest: '2018-05-01T00:00:00Z', on_hold: true }], reviews: cmp.st.reviews })) : route.fulfill(denied);
      case 'eab_admin_retention_review': {
        if (role !== 'owner') return route.fulfill(denied);
        const r = { id: cmp.next(), cutoff: '2019-10-22', counts: { records: 3, records_on_hold: 1, versions: 4, sign_ins: 10, problem_reports: 0, usage_days: 0 }, decision: args.p_decision, note: args.p_note, by_user: 'me', by_email: 'joe@example.com', at: cmp.now };
        cmp.st.reviews.unshift(r); return route.fulfill(ok(r));
      }
      case 'eab_admin_feed_schedule': {
        if (!ops.edit.includes(role)) return route.fulfill(denied);
        const it = ops.items.find(i => i.id === args.p_item); Object.assign(it, { status: 'published', published_at: args.p_at }); return route.fulfill(ok(it));
      }
      // AdminBatch008 — reports
      case 'eab_admin_report_catalog': {
        if (!['owner', 'admin', 'compliance', 'viewer'].includes(role)) return route.fulfill(denied);
        const out = {}; for (const [k, v] of Object.entries(rep.catalog)) if (v.roles.includes(role)) { const { roles, ...rest } = v; out[k] = { ...rest, allowed: true }; }
        return route.fulfill(ok(out));
      }
      case 'eab_admin_report_run': {
        const sp = args.p_spec; const src = rep.catalog[sp.source];
        if (!src || !src.roles.includes(role)) return route.fulfill(denied);
        const names = rep.staff.includes(role); const used = [...(sp.columns ?? []), ...(sp.group_by ?? []), ...(sp.filters ?? []).map(f => f.col)];
        if (!names && (!(sp.group_by ?? []).length || used.some(c => src.columns[c]?.p))) return route.fulfill(denied);
        let rs = sp.source === 'listings' ? rep.rows : [];
        for (const f of sp.filters ?? []) rs = rs.filter(r => f.op === 'contains' ? String(r[f.col] ?? '').toLowerCase().includes(String(f.value).toLowerCase())
          : f.op === 'min' ? r[f.col] >= f.value : f.op === 'in' ? f.value.includes(String(r[f.col])) : f.op === 'eq' ? String(r[f.col]) === String(f.value) : true);
        let out;
        if ((sp.group_by ?? []).length) {
          const m = new Map();
          for (const r of rs) { const key = sp.group_by.map(g => r[g]).join('|'); const o = m.get(key) ?? { ...Object.fromEntries(sp.group_by.map(g => [g, r[g]])), value: 0 };
            o.value += sp.measure?.startsWith('sum:') ? r[sp.measure.slice(4)] : 1; m.set(key, o); }
          out = [...m.values()].sort((a, b) => b.value - a.value);
        } else out = rs.map(r => Object.fromEntries(sp.columns.map(c => [c, r[c] ?? null])));
        return route.fulfill(ok({ rows: out.slice(0, sp.limit ?? 1000), count: Math.min(out.length, sp.limit ?? 1000), truncated: out.length > (sp.limit ?? 1000), run_at: rep.now }));
      }
      case 'eab_admin_saved_reports': return route.fulfill(ok(rep.saved.filter(r => rep.catalog[r.source].roles.includes(role) && (role !== 'viewer' || (r.spec.group_by ?? []).length))));
      case 'eab_admin_saved_report_save': {
        const p = args.p; if (role !== 'viewer' || !(p.spec.group_by ?? []).length) { if (!rep.staff.includes(role)) return route.fulfill(denied); }
        let r = p.id ? rep.saved.find(x => x.id === p.id) : null;
        if (r) Object.assign(r, { name: p.name, spec: p.spec, source: p.source, updated_by: 'me', updated_at: rep.now });
        else { r = { id: `sr-${rep.saved.length + 1}`, name: p.name, source: p.source, spec: p.spec, created_by: 'me', created_by_email: 'joe@example.com', created_at: rep.now, updated_by: null, updated_at: rep.now }; rep.saved.push(r); }
        return route.fulfill(ok(r));
      }
      case 'eab_admin_saved_report_delete': {
        const r = rep.saved.find(x => x.id === args.p_id); if (!r) return route.fulfill(ok(false));
        if (r.created_by !== 'me' && role !== 'owner') return route.fulfill(denied);
        rep.saved.splice(rep.saved.indexOf(r), 1); return route.fulfill(ok(true));
      }
      case 'eab_admin_board_report': return rep.board.includes(role)
        ? route.fulfill(ok({ month: args.p_month.slice(0, 7) + '-01', month_end: '2026-09-30', complete: true, made_at: rep.now, current: rep.nums(1), previous: rep.nums(0) })) : route.fulfill(denied);
      case 'eab_admin_audit_bundle': return rep.board.includes(role) ? route.fulfill(ok({ ...rep.bundle, year: args.p_year })) : route.fulfill(denied);
      // ---------- AdminBatch008 ----------
      case 'eab_admin_broadcasts': return ['owner', 'admin', 'compliance', 'viewer'].includes(role) ? route.fulfill(ok(b8.st.broadcasts.map(b8.json))) : route.fulfill(denied);
      case 'eab_admin_broadcast': return ['owner', 'admin', 'compliance'].includes(role) ? route.fulfill(ok(b8.detail(b8.st.broadcasts.find(b => b.id === args.p_id)))) : route.fulfill(denied);
      case 'eab_admin_broadcast_save': {
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        const p = args.p; let b = p.id && b8.st.broadcasts.find(x => x.id === p.id);
        if (b) Object.assign(b, p, { updated_at: b8.now });
        else { b = { ...p, id: b8.id(), ref: `BC-2026-${String(b8.st.broadcasts.length + 1).padStart(4, '0')}`, status: 'draft', created_by: 'me', created_at: b8.now, updated_at: b8.now,
          queued_at: null, queued_by: null, claimed_at: null, finished_at: null }; b8.st.broadcasts.unshift(b); }
        return route.fulfill(ok(b8.json(b)));
      }
      case 'eab_admin_broadcast_preview': {
        const b = b8.st.broadcasts.find(x => x.id === args.p_id); const cs = b8.agents.map(a => b8.cand(b, a));
        return route.fulfill(ok({ matched: cs.length, reach: cs.filter(c => c === 'pending').length, no_address: cs.filter(c => c === 'skipped_no_address').length,
          no_consent: cs.filter(c => c === 'skipped_no_consent').length, not_active: cs.filter(c => c === 'skipped_not_active').length }));
      }
      case 'eab_admin_broadcast_queue': {
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        const b = b8.st.broadcasts.find(x => x.id === args.p_id);
        for (const a of b8.agents) b8.st.recipients.push({ id: b8.st.recipients.length + 1, broadcast_id: b.id, user_id: a.user_id, email: a.email, name: a.name,
          address: b.channel === 'email' ? a.email : a.phone, lang: a.lang, status: b8.cand(b, a), error: null, sent_at: null, sent_by_email: null });
        Object.assign(b, { status: 'queued', queued_at: b8.now, queued_by: 'me', queue_reason: args.p_reason }); return route.fulfill(ok(b8.json(b)));
      }
      case 'eab_admin_broadcast_cancel': {
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        const b = b8.st.broadcasts.find(x => x.id === args.p_id);
        b8.st.recipients.filter(r => r.broadcast_id === b.id && r.status === 'pending').forEach(r => { r.status = 'cancelled'; });
        b.status = 'cancelled'; return route.fulfill(ok(b8.json(b)));
      }
      case 'eab_admin_broadcast_wa_opened': {
        if (!['owner', 'admin'].includes(role)) return route.fulfill(denied);
        const r = b8.st.recipients.find(x => x.id === args.p_recipient); Object.assign(r, { status: 'opened_wa', sent_at: b8.now, sent_by_email: 'joe@example.com' });
        const b = b8.st.broadcasts.find(x => x.id === r.broadcast_id);
        b.status = b8.st.recipients.some(x => x.broadcast_id === b.id && x.status === 'pending') ? 'sending' : 'done'; return route.fulfill(ok(b8.json(b)));
      }
      case 'eab_admin_report_settings': return ['owner', 'compliance'].includes(role) ? route.fulfill(ok(b8.settingsJson())) : route.fulfill(denied);
      case 'eab_admin_report_settings_save': {
        if (role !== 'owner') return route.fulfill(denied);
        Object.assign(b8.st.settings, args.p, { updated_by: 'me' }); return route.fulfill(ok(b8.settingsJson()));
      }
      case 'eab_admin_reports': return ['owner', 'compliance'].includes(role) ? route.fulfill(ok(b8.st.runs)) : route.fulfill(denied);
      case 'eab_admin_report_download': {
        const r = b8.st.runs.find(x => x.id === args.p_run); return route.fulfill(ok({ path: `reports/${r.id}/${r.sha256}`, file_name: r.file_name, sha256: r.sha256 }));
      }
      case 'eab_admin_check_report': return route.fulfill(ok(b8.st.runs.find(r => r.sha256 === args.p_sha256) ?? null));
      case 'eab_admin_workspaces': return ['owner', 'admin', 'compliance'].includes(role) ? route.fulfill(ok(b8.workspaces)) : route.fulfill(denied);
      case 'eab_admin_workspace': return ['owner', 'admin', 'compliance'].includes(role) ? route.fulfill(ok(b8.workspace)) : route.fulfill(denied);
      case 'eab_admin_todo': return route.fulfill(ok({ tasks: b8.st.tasks.filter(t => !t.removed).map(t => ({ ...t, mine: t.owner_user === 'me' })),
        events: b8.st.events.filter(e => !e.removed).map(e => ({ ...e, mine: e.owner_user === 'me' })) }));
      case 'eab_admin_task_save': {
        const p = args.p;
        if (!p.id) { if (p.shared && role === 'viewer') return route.fulfill(denied);
          const t = { id: b8.id(), owner_user: 'me', shared: !!p.shared, title: p.title, notes: null, due_on: p.due_on ?? null, done: false, done_at: null, done_by: null,
            created_at: b8.now, updated_at: b8.now, owner_email: 'joe@example.com', done_by_email: null }; b8.st.tasks.push(t); return route.fulfill(ok(t)); }
        const t = b8.st.tasks.find(x => x.id === p.id);
        if (t.owner_user !== 'me' && (!t.shared || role === 'viewer')) return route.fulfill(denied);
        if ('done' in p) Object.assign(t, { done: p.done, done_by: p.done ? 'me' : null, done_by_email: p.done ? 'joe@example.com' : null });
        if (p.removed) t.removed = true; return route.fulfill(ok(t));
      }
      case 'eab_admin_event_save': {
        const p = args.p;
        if (!p.id) { if (p.shared && role === 'viewer') return route.fulfill(denied);
          const e = { id: b8.id(), owner_user: 'me', shared: !!p.shared, title: p.title, notes: p.notes, place: p.place, starts_at: p.starts_at, ends_at: p.ends_at,
            all_day: !!p.all_day, created_at: b8.now, updated_at: b8.now, owner_email: 'joe@example.com' }; b8.st.events.push(e); return route.fulfill(ok(e)); }
        const e = b8.st.events.find(x => x.id === p.id); if (p.removed) e.removed = true; return route.fulfill(ok(e));
      }
      default: return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
  });
  await page.goto(BASE);
  return { page, ctx, calls, b8 };
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

// ---------------- AdminBatch006: News & Announcements, Support & operations, Overview ----------------

test('owner: write a Market News post in EN + BM with an uploaded picture, for a group, preview, publish, send the push alert (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-N').click();
  await page.getByTestId('post-list').waitFor();
  assert.match(await page.getByTestId('posts-news').innerText(), /OPR cut to 2\.75%[\s\S]*waiting to be sent/);
  await page.getByTestId('post-new').click();
  await page.getByTestId('post-save').click();
  await page.getByTestId('post-problems').getByText(/English title is needed/).waitFor();
  await page.getByTestId('title-en').fill('Home loan rates fall');
  await page.getByTestId('body-en').fill('Most banks lowered their base rate this week.');
  await page.getByTestId('lang-bm').click();
  await page.getByTestId('title-bm').fill('Kadar pinjaman rumah turun');
  await page.getByTestId('image-file').setInputFiles({ name: 'rates.png', mimeType: 'image/png', buffer: Buffer.from('fakepng') });
  await page.waitForFunction(() => (document.querySelector('[data-testid="image-url"]')?.value ?? '').includes('/storage/v1/object/public/eab-feed-media/'));
  await page.getByTestId('link').fill('http://not-secure.example.com');
  await page.getByTestId('aud-groups').click();
  await page.getByTestId('aud-groups').getByText('BM speakers').click();
  await page.getByTestId('push-alert').check();
  await page.getByTestId('post-save-publish').click();
  await page.getByTestId('post-problems').getByText('The website link must start with https://').waitFor();
  await page.getByTestId('link').fill('https://www.bnm.gov.my');
  await page.getByTestId('preview').click();
  assert.match(await page.getByTestId('preview-box').innerText(), /Kadar pinjaman rumah turun/);
  await page.screenshot({ path: `${SHOTS}/30-news-editor-laptop.png`, fullPage: true });
  await page.getByTestId('post-save-publish').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Weekly market update');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('post-msg').getByText('Published: Home loan rates fall').waitFor();
  const save = calls.find(c => c.fn === 'eab_admin_feed_save');
  assert.equal(save.args.p_item.title_bm, 'Kadar pinjaman rumah turun');
  assert.equal(save.args.p_item.audience, 'groups'); assert.equal(save.args.p_item.group_ids.length, 1);
  assert.match(save.args.p_item.image_url, /^https:\/\/fake\.supabase\.co\/storage\/v1\/object\/public\/eab-feed-media\/2026\/[0-9a-f-]{36}\.png$/);
  assert.equal(save.args.p_reason, 'Weekly market update');
  assert.ok(calls.some(c => c.fn === 'eab_admin_feed_set_status' && c.args.p_status === 'published'));
  // send every waiting alert from the Push tab
  await page.getByTestId('ntab-push').click();
  await page.getByTestId('push-list').waitFor();
  await page.getByTestId('push-send-all').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Send this week\'s alerts');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('push-msg').getByText(/Sent to 8 agents/).waitFor();
  assert.ok(calls.some(c => c.fn.includes('/functions/v1/send-push')));
  await page.getByTestId('push-list').getByText('Done').first().waitFor();
  assert.match(await page.getByTestId('push').innerText(), /at least/i);
  await page.screenshot({ path: `${SHOTS}/31-push-laptop.png`, fullPage: true });
  await ctx.close();
});

test('admin: order per group by typed position (other kinds kept), audience group with live count, invitation code and removing access (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  await page.getByTestId('tile-N').click();
  await page.getByTestId('order-open').click();
  await page.getByTestId('order-list').waitFor();
  const rows = page.getByTestId('order-row');
  assert.match(await rows.nth(0).innerText(), /New stamp duty rules/, 'newest first when no order is saved');
  await page.getByTestId('order-pos').nth(0).fill('2');
  await page.getByTestId('order-pos').nth(0).press('Enter');
  assert.match(await rows.nth(0).innerText(), /OPR cut/);
  await page.getByTestId('order-save').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('OPR news first');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('post-msg').getByText(/Order saved/).waitFor();
  const set = calls.find(c => c.fn === 'eab_admin_feed_order_set');
  assert.equal(set.args.p_items.length, 3, 'the project already ordered in Everyone is kept');
  await page.screenshot({ path: `${SHOTS}/32-news-order-phone.png`, fullPage: true });
  // audience group
  await page.getByTestId('ntab-groups').click();
  await page.getByTestId('group-new').click();
  await page.getByTestId('group-name').fill('Selangor REN');
  await page.getByTestId('f-emails').fill('agent@example.com, nope');
  await page.getByText('Not an email address: nope').waitFor();
  assert.ok(await page.getByTestId('group-save').isDisabled());
  await page.getByTestId('f-emails').fill('agent@example.com');
  await page.getByTestId('f-licence_types-REN').check();
  await page.getByTestId('group-count').getByText(/1 of 6 agents match/).waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_group_preview' && c.args.p_filters.emails?.[0] === 'agent@example.com'));
  await page.getByTestId('group-save').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Pilot group for Selangor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('group-list').getByText('Selangor REN').waitFor();
  assert.deepEqual(calls.find(c => c.fn === 'eab_admin_group_save').args.p_group.filters, { emails: ['agent@example.com'], licence_types: ['REN'] });
  await page.screenshot({ path: `${SHOTS}/33-groups-phone.png`, fullPage: true });
  // invitation codes
  await page.getByTestId('ntab-codes').click();
  await page.getByTestId('code-list').waitFor();
  await page.getByTestId('code-new').click();
  await page.getByTestId('code-project').first().check();
  await page.getByTestId('code-max').fill('25');
  await page.getByTestId('code-create').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('For the Klang team');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('code-made').getByText('NEWC0DE234').waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_code_create').args.p_max_uses, 25);
  await page.getByTestId('code-who').last().click();
  await page.getByTestId('code-grants').getByText('agent@example.com').first().waitFor();
  await page.getByTestId('grant-revoke').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Left the Selangor team');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('code-grants').getByText('Nobody yet.').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_code_revoke' && c.args.p_user === AGENT));
  await ctx.close();
});

test('admin: support ticket — screenshot, note, mark seen (laptop); compliance reads only', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 1366 });
  await page.getByTestId('tile-65').click();
  await page.getByTestId('ticket-list').waitFor();
  assert.match(await page.getByTestId('tickets').innerText(), /Photo upload stuck at 90%/);
  await page.getByTestId('ticket-row').click();
  await page.getByTestId('ticket-shot-open').click();
  await page.getByTestId('ticket-shot').waitFor();
  assert.match(await page.getByTestId('ticket-email').getAttribute('href'), /^mailto:agent%40example\.com\?subject=/);
  assert.ok(await page.getByTestId('ticket-save').isDisabled(), 'a note is needed');
  await page.getByTestId('ticket-note').fill('Asked Siti to update to 2.2.1');
  await page.getByTestId('ticket-to-seen').click();
  await page.getByTestId('ticket-save').click();
  await page.getByTestId('ticket-history').getByText(/New → Seen/).waitFor();
  assert.equal(await page.getByTestId('ticket-status').innerText(), 'Seen');
  const st = calls.find(c => c.fn === 'eab_admin_ticket_set_status');
  assert.equal(st.args.p_status, 'seen'); assert.equal(st.args.p_note, 'Asked Siti to update to 2.2.1');
  await page.screenshot({ path: `${SHOTS}/34-ticket-laptop.png`, fullPage: true });
  await ctx.close();
  const c2 = await open({ role: 'compliance', width: 390 });
  await c2.page.getByTestId('tile-65').click();
  await c2.page.getByTestId('ticket-row').click();
  await c2.page.getByTestId('ticket-text').waitFor();
  assert.equal(await c2.page.getByTestId('ticket-actions').count(), 0);
  await c2.ctx.close();
});

test('owner: maintenance on (3 languages, reason), minimum version hard block, a feature flag for a group (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 390 });
  await page.getByTestId('tile-68').click();
  await page.getByTestId('maint-state').waitFor();
  assert.ok(await page.getByTestId('maint-on').isDisabled(), 'needs the English message');
  await page.getByTestId('maint-en').fill('We are upgrading the servers.');
  await page.getByTestId('maint-bm').fill('Kami sedang menaik taraf pelayan.');
  await page.getByTestId('maint-back').fill('2026-10-23T02:00');
  await page.getByTestId('maint-on').click();
  await page.getByText(/Every agent is blocked/).waitFor();
  await page.getByPlaceholder(/At least 5 characters/).fill('Database upgrade tonight');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('maint-state').getByText(/Maintenance mode is ON/).waitFor();
  const m = calls.find(c => c.fn === 'eab_admin_set_settings').args;
  assert.equal(m.p_patch.maintenance_on, true); assert.equal(m.p_patch.maintenance_message_bm, 'Kami sedang menaik taraf pelayan.');
  assert.equal(m.p_patch.maintenance_back_at, '2026-10-22T18:00:00.000Z'); assert.equal(m.p_reason, 'Database upgrade tonight');
  await page.screenshot({ path: `${SHOTS}/35-maintenance-phone.png`, fullPage: true });
  await page.getByTestId('otab-release').click();
  await page.getByTestId('rel-version').fill('2.x');
  await page.getByText('A version looks like 2.2.0').waitFor();
  await page.getByTestId('rel-version').fill('2.2.0');
  await page.getByTestId('rel-hard').check();
  await page.getByTestId('rel-url').fill('https://github.com/jslproperties101/estate-agent-buddy/releases');
  await page.getByTestId('rel-save').click();
  await page.getByText(/Agents on an older version cannot use the app/).waitFor();
  await page.getByPlaceholder(/At least 5 characters/).fill('2.1 has the sync bug');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('release-state').getByText('Hard block').waitFor();
  await page.getByTestId('otab-flags').click();
  await page.getByTestId('flags-note').waitFor();
  await page.getByTestId('flag-new').click();
  await page.getByTestId('flag-label').fill('House Shopping v2');
  assert.equal(await page.getByTestId('flag-key').inputValue(), 'house_shopping_v2');
  await page.getByTestId('flag-groups').check();
  assert.ok(await page.getByTestId('flag-save').isDisabled(), 'choose a group');
  await page.getByTestId('flag-group').first().check();
  await page.getByTestId('flag-enabled').check();
  await page.getByTestId('flag-save').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Pilot with BM speakers');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('flag-list').getByText('House Shopping v2').waitFor();
  const f = calls.find(c => c.fn === 'eab_admin_flag_save').args.p_flag;
  assert.equal(f.key, 'house_shopping_v2'); assert.equal(f.audience, 'groups'); assert.equal(f.enabled, true); assert.equal(f.group_ids.length, 1);
  await page.screenshot({ path: `${SHOTS}/36-flags-phone.png`, fullPage: true });
  await ctx.close();
});

test('compliance: Master Dashboard alerts open the screen behind them; Top Agents and Live Users with names (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 1366 });
  await page.getByTestId('tile-71').click();
  await page.getByTestId('alerts').waitFor();
  const t = await page.getByTestId('alerts').innerText();
  assert.match(t, /No backup restore test has been recorded/);
  assert.match(t, /11 sync failures in 7 days \(11%\)/);
  assert.match(t, /1 new problem report/);
  assert.ok(t.indexOf('No backup restore test') < t.indexOf('new problem report'), 'red first');
  await page.screenshot({ path: `${SHOTS}/37-master-laptop.png`, fullPage: true });
  await page.getByRole('button', { name: '1 new problem report' }).click();
  await page.getByTestId('ticket-list').waitFor();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-58').click();
  await page.getByTestId('top-list').waitFor();
  assert.match(await page.getByTestId('top-list').innerText(), /1\s+Siti Agent/);
  await page.getByTestId('top-90').click();
  await page.waitForFunction(() => true);
  assert.ok(calls.filter(c => c.fn === 'eab_admin_dash_top_agents').length >= 1);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-22').click();
  await page.getByTestId('live-list').waitFor();
  assert.match(await page.getByTestId('live-list').innerText(), /Siti Agent[\s\S]*Add \/ edit listing/);
  await ctx.close();
});

test('viewer: Master Dashboard and news read-only; no tickets, top agents or names (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'viewer', width: 390 });
  await page.getByTestId('tile-71').waitFor();
  for (const n of [65, 58]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await page.getByTestId('tile-71').click();
  await page.getByTestId('alerts').waitFor();
  assert.equal(await page.getByRole('button', { name: '1 new problem report' }).count(), 0, 'the ticket alert is not a link for a viewer');
  await page.screenshot({ path: `${SHOTS}/38-master-viewer-phone.png`, fullPage: true });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-N').click();
  await page.getByTestId('post-list').waitFor();
  await page.getByTestId('read-only').waitFor();
  for (const id of ['post-new', 'post-edit', 'post-publish', 'order-open']) assert.equal(await page.getByTestId(id).count(), 0, id);
  await page.getByTestId('ntab-codes').click();
  await page.getByTestId('code-list').waitFor();
  assert.equal(await page.getByTestId('code-who').count(), 0, 'who used a code names agents');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-22').click();
  await page.getByTestId('live-count').waitFor();
  assert.equal(await page.getByTestId('live-list').count(), 0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-67').click();
  await page.getByTestId('flags').waitFor();
  assert.equal(await page.getByTestId('flag-new').count(), 0);
  assert.ok(!calls.some(c => ['eab_admin_tickets', 'eab_admin_code_grants', 'eab_admin_dash_top_agents'].includes(c.fn)));
  await ctx.close();
});

// ---------------- AdminBatch007: compliance core ----------------

test('compliance: log a PDPA deletion request for an agent, put the agent on legal hold, "done" is refused, then refuse with a note (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 1366 });
  await page.getByTestId('tile-50').click();
  await page.getByTestId('pdpa').waitFor();
  await page.getByTestId('pdpa-new').click();
  await page.getByTestId('agent-q').fill('siti');
  await page.getByTestId('agent-find').click();
  await page.getByTestId('agent-hit').click();
  await page.getByTestId('pdpa-name').fill('Siti Agent');
  await page.getByTestId('pdpa-kind').selectOption('deletion');
  await page.getByTestId('pdpa-save').click();
  await page.getByText('Write what was asked.').waitFor();
  await page.getByTestId('pdpa-details').fill('Please delete all my listings and contacts.');
  await page.getByTestId('pdpa-save').click();
  await page.getByTestId('pdpa-req').waitFor();
  assert.match(await page.getByTestId('pdpa-req').innerText(), /PDPA-2026-0001[\s\S]*Logging only: nothing is deleted/);
  const cr = calls.find(c => c.fn === 'eab_admin_pdpa_create').args.p;
  assert.equal(cr.agent_user, AGENT); assert.equal(cr.kind, 'deletion');
  // legal hold from the Legal Hold screen
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-88').click();
  await page.getByTestId('hold-form').getByTestId('agent-q').fill('siti');
  await page.getByTestId('hold-form').getByTestId('agent-find').click();
  await page.getByTestId('hold-form').getByTestId('agent-hit').click();
  await page.getByTestId('hold-place').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Police report RPT/88');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('hold-list').getByText('On hold').waitFor();
  await page.screenshot({ path: `${SHOTS}/39-holds-laptop.png`, fullPage: true });
  // back to the request: marked done is refused while on hold
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-50').click();
  await page.getByTestId('pdpa-row').click();
  await page.getByTestId('pdpa-hold').waitFor();
  await page.getByTestId('pdpa-to-done').click();
  await page.getByTestId('pdpa-note').fill('Trying to close');
  assert.ok(await page.getByTestId('pdpa-apply').isDisabled(), 'done is blocked on the screen while on hold');
  await page.getByTestId('pdpa-to-done').click();
  await page.getByTestId('pdpa-to-refused').click();
  await page.getByTestId('pdpa-decision').fill('Kept: inside the 7-year period');
  await page.getByTestId('pdpa-note').fill('Lawyer advice 22 Oct');
  await page.getByTestId('pdpa-apply').click();
  await page.getByTestId('history').getByText(/Open → Refused/).waitFor();
  const up = calls.find(c => c.fn === 'eab_admin_pdpa_update').args;
  assert.equal(up.p.status, 'refused'); assert.equal(up.p.decision, 'Kept: inside the 7-year period'); assert.equal(up.p_note, 'Lawyer advice 22 Oct');
  await page.screenshot({ path: `${SHOTS}/40-pdpa-laptop.png`, fullPage: true });
  await ctx.close();
});

test('admin: complaint register; tags, note and licence expiry on the Agent Profile; licence list (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  assert.equal(await page.getByTestId('tile-50').count(), 0, 'PDPA is owner / compliance');
  await page.getByTestId('tile-91').click();
  await page.getByTestId('complaint-new').click();
  await page.getByTestId('cmp-name').fill('Buyer Tan');
  await page.getByTestId('cmp-listing').fill('P1001');
  await page.getByTestId('cmp-details').fill('The advert said freehold but the title is leasehold.');
  await page.getByTestId('cmp-save').click();
  await page.getByTestId('complaint').waitFor();
  await page.getByTestId('cmp-to-investigating').click();
  await page.getByTestId('cmp-note').fill('Asked the agent for the title copy');
  await page.getByTestId('cmp-apply').click();
  await page.getByTestId('history').getByText(/Open → Investigating/).waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_complaint_create').args.p.category, 'misleading_listing');
  assert.equal(await page.getByTestId('case-pick').count(), 0, 'admin cannot see case files');
  await page.screenshot({ path: `${SHOTS}/41-complaint-phone.png`, fullPage: true });
  // agent profile internal box
  await page.getByTestId('global-search').fill('siti');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByTestId('hit-agent').first().click();
  await page.getByTestId('internal-box').waitFor();
  await page.getByTestId('tag-input').fill('VIP');
  await page.getByTestId('tag-add').click();
  await page.getByTestId('agent-tag').getByText('vip').waitFor();
  await page.getByTestId('agent-note').fill('Met at the Board office');
  await page.getByTestId('agent-note-save').click();
  await page.getByTestId('agent-notes').getByText('Met at the Board office').waitFor();
  assert.equal(await page.getByTestId('internal-hold').count(), 0, 'admin cannot place a legal hold');
  await page.getByTestId('internal-expiry').fill('2027-01-31');
  await page.getByTestId('internal-expiry-save').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('From the REN card');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('licence-expiry').getByText(/2027-01-31/).waitFor();
  assert.deepEqual(calls.find(c => c.fn === 'eab_admin_agent_tag').args.p_tag, 'vip');
  await page.screenshot({ path: `${SHOTS}/42-agent-internal-phone.png`, fullPage: true });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-82').click();
  await page.getByTestId('licence-list').waitFor();
  assert.match(await page.getByTestId('licence-list').innerText(), /No expiry date/);
  await ctx.close();
});

test('owner: retention review (nothing deleted), schedule a post and copy a post (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-51').click();
  await page.getByTestId('no-delete').waitFor();
  assert.match(await page.getByTestId('retention-agents').innerText(), /Siti Agent[\s\S]*Legal hold/);
  await page.getByTestId('ret-keep').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Lawyer has not answered: keep everything');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('retention-reviews').getByText(/Keep/).waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_retention_review').args.p_decision, 'keep');
  assert.ok(!calls.some(c => /delete/i.test(c.fn)), 'no delete call anywhere');
  await page.screenshot({ path: `${SHOTS}/43-retention-laptop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-N').click();
  await page.getByTestId('post-copy').first().click();
  assert.equal(await page.getByTestId('title-en').inputValue(), 'OPR cut to 2.75% (copy)');
  await page.getByTestId('title-en').fill('OPR outlook for December');
  await page.getByTestId('publish-at').fill('2020-01-01T09:00');
  await page.getByText('Pick a time from now on, before the end date.').waitFor();
  await page.getByTestId('publish-at').fill('2030-12-01T09:00');
  await page.getByTestId('post-schedule').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Monthly outlook, scheduled');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('post-msg').getByText(/Scheduled for 2030-12-01 09:00/).waitFor();
  const sch = calls.find(c => c.fn === 'eab_admin_feed_schedule').args;
  assert.equal(sch.p_at, '2030-12-01T01:00:00.000Z');
  assert.equal(calls.find(c => c.fn === 'eab_admin_feed_save').args.p_item.id, undefined, 'a copy is a new post');
  await page.getByTestId('post-state').filter({ hasText: 'Scheduled' }).first().waitFor();
  await ctx.close();
});

test('viewer: no compliance screens', async () => {
  const { page, ctx } = await open({ role: 'viewer', width: 390 });
  await page.getByTestId('tile-71').waitFor();
  for (const n of [50, 51, 82, 88, 91]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await ctx.close();
});

test('compliance: Board report compared with last month → PDF kept in the vault; audit bundle → Excel workbook + PDF summary in the vault (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 1366 });
  await page.getByTestId('tile-90').click();
  await page.getByTestId('board-table').waitFor();
  const t = await page.getByTestId('board-table').innerText();
  assert.match(t, /September 2026[\s\S]*August 2026/); assert.match(t, /New agents\s+5\s+3\s+\+2 \(\+67%\)/); assert.match(t, /50% \(last: 100%\)/);
  assert.equal(calls.find(c => c.fn === 'eab_admin_board_report').args.p_month, '2026-09-01', 'last full month first');
  await page.screenshot({ path: `${SHOTS}/45-board-report-laptop.png`, fullPage: true });
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('board-pdf').click()]);
  assert.match(pdf.suggestedFilename(), /^Board-report-2026-09-EAB-20261021-000007\.pdf$/);
  await page.getByTestId('board-msg').getByText(/kept in the Document Vault/).waitFor();
  const reg = calls.find(c => c.fn === 'eab_admin_pack_register').args.p;
  assert.equal(reg.kind, 'board_report'); assert.equal(reg.case_id, null); assert.match(reg.content_sha256, /^[0-9a-f]{64}$/);
  assert.ok(calls.some(c => c.fn === 'storage_upload') && calls.some(c => c.fn === 'eab_admin_pack_stored'), 'uploaded and marked stored');
  assert.equal(calls.find(c => c.fn === 'eab_admin_export').args.p_kind, 'board_report');
  // audit bundle
  await page.getByTestId('rtab-audit').click();
  await page.getByTestId('audit-check').click();
  await page.getByTestId('audit-summary').getByText('Both logs unbroken').waitFor();
  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  await page.getByTestId('audit-make').click();
  await page.getByTestId('audit-msg').getByText(/Workbook .* and summary .* kept in the Document Vault/).waitFor({ timeout: 30000 });
  const packs = calls.filter(c => c.fn === 'eab_admin_pack_register').map(c => c.args.p).filter(p => p.kind === 'audit_bundle');
  assert.deepEqual(packs.map(p => p.format), ['xlsx', 'pdf']);
  const ex = calls.filter(c => c.fn === 'eab_admin_export' && c.args.p_kind === 'audit_bundle');
  assert.deepEqual(ex.map(c => c.args.p_format), ['xlsx', 'pdf']); assert.equal(ex[1].args.p_detail.workbook, 'EAB-20261021-000007', 'the summary names the workbook');
  await page.waitForTimeout(300);
  assert.deepEqual(downloads.sort(), ['Audit-bundle-2026-summary-EAB-20261021-000007.pdf', 'Audit-bundle-2026-workbook-EAB-20261021-000007.xlsx']);
  await page.screenshot({ path: `${SHOTS}/46-audit-bundle-laptop.png`, fullPage: true });
  // the vault lists both kinds in plain words
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-19').click();
  await page.getByText('Monthly Board report').first().waitFor();
  await page.getByText('Annual audit bundle').first().waitFor();
  await ctx.close();
});

test('admin: report builder — list with columns and a filter, then totals with a chart; save shared; no exports, no Board report (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  for (const n of [90, 129]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await page.getByTestId('tile-127').click();
  await page.getByTestId('rb-form').waitFor();
  assert.equal(await page.getByTestId('rtab-board').count(), 0);
  const sources = await page.getByTestId('rb-source').locator('option').allInnerTexts();
  assert.ok(sources.includes('Complaints') && !sources.includes('PDPA requests'), 'admin: complaints yes, PDPA no');
  await page.getByTestId('rb-source').selectOption('listings');
  for (const c of ['agent_email', 'ref', 'state', 'status']) if (!(await page.getByTestId(`rb-col-${c}`).isChecked())) await page.getByTestId(`rb-col-${c}`).check();
  await page.getByTestId('rb-col-agent_email').uncheck();
  await page.getByTestId('rb-col-asking_price').check();
  await page.getByTestId('rb-add-filter').click();
  await page.getByTestId('rb-f-col-0').selectOption('asking_price');
  await page.getByTestId('rb-f-val-0').fill('lots');
  await page.getByTestId('rb-problems').getByText('"Asking price (RM)" needs a number.').waitFor();
  assert.ok(await page.getByTestId('rb-run').isDisabled());
  await page.getByTestId('rb-f-val-0').fill('400000');
  await page.getByTestId('rb-run').click();
  await page.getByTestId('rb-table').waitFor();
  assert.match(await page.getByTestId('rb-count').innerText(), /^2 rows/);
  assert.match(await page.getByTestId('rb-table').innerText(), /P1002[\s\S]*900,000/);
  const spec = calls.find(c => c.fn === 'eab_admin_report_run').args.p_spec;
  assert.deepEqual(spec.filters, [{ col: 'asking_price', op: 'min', value: 400000 }]);
  assert.equal(await page.getByTestId('rb-pdf').count(), 0, 'admin cannot export');
  // totals with a chart
  await page.getByTestId('rb-mode-totals').check();
  await page.getByTestId('rb-group-0').selectOption('state');
  await page.getByTestId('rb-measure').selectOption('sum:asking_price');
  await page.getByTestId('rb-run').click();
  await page.getByTestId('rb-chart').waitFor();
  assert.match(await page.getByTestId('rb-table').innerText(), /Selangor\s+1,380,000/);
  await page.getByTestId('rb-name').fill('Value by state');
  await page.getByTestId('rb-save').click();
  await page.getByTestId('rb-msg').getByText(/Saved “Value by state”/).waitFor();
  const sv = calls.find(c => c.fn === 'eab_admin_saved_report_save').args.p;
  assert.equal(sv.source, 'listings'); assert.deepEqual(sv.spec.group_by, ['state']); assert.equal(sv.spec.measure, 'sum:asking_price');
  assert.equal(await page.getByTestId('rb-saved-row').count(), 2);
  // someone else's saved report: no Remove for an admin
  assert.equal(await page.getByTestId('rb-saved-row').filter({ hasText: 'Ali' }).getByTestId('rb-remove').count(), 0);
  await page.screenshot({ path: `${SHOTS}/47-report-builder-phone.png`, fullPage: true });
  await ctx.close();
});

test('viewer: report builder makes totals only — no lists, no names; no Board report or audit bundle (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'viewer', width: 390 });
  for (const n of [90, 129]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await page.getByTestId('tile-127').click();
  await page.getByTestId('rb-totals-only').waitFor();
  assert.ok(await page.getByTestId('rb-mode-rows').isDisabled());
  const sources = await page.getByTestId('rb-source').locator('option').allInnerTexts();
  assert.ok(!sources.includes('Complaints'), 'no complaints for a viewer');
  await page.getByTestId('rb-source').selectOption('listings');
  const groups = await page.getByTestId('rb-group-0').locator('option').allInnerTexts();
  assert.ok(!groups.includes('Agent email'), 'no personal columns offered');
  await page.getByTestId('rb-group-0').selectOption('status');
  await page.getByTestId('rb-run').click();
  await page.getByTestId('rb-chart').waitFor();
  assert.ok(calls.filter(c => c.fn === 'eab_admin_report_run').every(c => c.args.p_spec.group_by?.length && !c.args.p_spec.columns));
  await page.screenshot({ path: `${SHOTS}/48-report-builder-viewer-phone.png`, fullPage: true });
  await ctx.close();
});

test('owner: open a shared saved report, run it, export Excel, then remove it (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-127').click();
  await page.getByTestId('rb-open').filter({ hasText: 'Listings by state (Ali)' }).click();
  assert.equal(await page.getByTestId('rb-name').inputValue(), 'Listings by state (Ali)');
  assert.equal(await page.getByTestId('rb-group-0').inputValue(), 'state');
  await page.getByTestId('rb-run').click();
  await page.getByTestId('rb-chart').waitFor();
  const [x] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rb-xlsx').click()]);
  assert.equal(x.suggestedFilename(), 'Report-Listings-by-state-Ali-EAB-20261021-000007.xlsx');
  const ex = calls.find(c => c.fn === 'eab_admin_export').args;
  assert.equal(ex.p_kind, 'custom_report'); assert.equal(ex.p_detail.source, 'listings');
  assert.ok(!calls.some(c => c.fn === 'eab_admin_pack_register'), 'a custom report is not vaulted');
  await page.getByTestId('rb-remove').click();
  await page.getByTestId('rb-remove-yes').click();
  await page.getByTestId('rb-msg').getByText(/Removed “Listings by state \(Ali\)”/).waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_saved_report_delete').args.p_id, 'sr-1');
  assert.equal(await page.getByTestId('rb-saved-row').count(), 0);
  await ctx.close();
});

test('regulator: no reports', async () => {
  const { page, ctx } = await open({ role: 'regulator', width: 390 });
  await page.getByTestId('tile-my-case').waitFor();
  for (const n of [90, 127, 129]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n}`);
  await ctx.close();
});

// ======================================================================================== AdminBatch008
test('owner: email news broadcast in EN + BM — preview skips the no-consent and banned agents, make ready (reason), send; Resend refusal shown (laptop)', async () => {
  const { page, ctx, calls, b8 } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-64').click();
  await page.getByTestId('broadcasts').waitFor();
  await page.getByTestId('bc-new').click();
  await page.getByTestId('bc-news').check();
  assert.ok(await page.getByTestId('bc-save').isDisabled(), 'needs the English subject and text');
  await page.getByTestId('bc-subject-en').fill('New launch: Residensi Gold');
  await page.getByTestId('bc-body-en').fill('Open for booking from Monday.');
  await page.getByTestId('bc-subject-bm').fill('Pelancaran baharu');
  await page.getByTestId('bc-body-bm').fill('Dibuka untuk tempahan mulai Isnin.');
  await page.getByTestId('bc-save').click();
  await page.getByTestId('broadcast').waitFor();
  const saved = calls.find(c => c.fn === 'eab_admin_broadcast_save').args.p;
  assert.equal(saved.channel, 'email'); assert.equal(saved.kind, 'news'); assert.equal(saved.body_bm, 'Dibuka untuk tempahan mulai Isnin.');
  await page.getByTestId('bc-preview').getByText(/1 agent will get it now, of 3/).waitFor();
  assert.match(await page.getByTestId('bc-preview').innerText(), /1 said no to news & offers.*1 account is not active/s);
  await page.getByTestId('bc-queue').click();
  await page.getByText(/this is a broadcast to ALL agents/).waitFor();
  await page.getByPlaceholder(/At least 5 characters/).fill('Launch news for opted-in agents');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('bc-status').getByText('Ready to send').waitFor();
  assert.equal(calls.find(c => c.fn === 'eab_admin_broadcast_queue').args.p_reason, 'Launch news for opted-in agents');
  assert.equal(await page.getByTestId('bc-recipient').count(), 3);
  await page.getByTestId('bc-send').click();
  await page.getByTestId('bc-sent').getByText('1 sent, 0 failed.').waitFor();
  await page.getByTestId('bc-status').getByText('Done').waitFor();
  assert.equal(b8.st.sends[0].broadcast_id, saved.id ?? b8.st.broadcasts[0].id);
  const rows = await page.getByTestId('bc-recipient').allInnerTexts();
  assert.ok(rows.some(r => /Siti Agent[\s\S]*Bahasa Melayu[\s\S]*Sent/.test(r)), rows.join('|'));
  assert.ok(rows.some(r => /Ali[\s\S]*Skipped: said no to news & offers/.test(r)));
  assert.ok(rows.some(r => /Banned Bob[\s\S]*Skipped: account not active/.test(r)));
  await page.screenshot({ path: `${SHOTS}/50-broadcast-laptop.png`, fullPage: true });
  await page.getByRole('button', { name: '← Back' }).click();
  await page.getByTestId('bc-list').getByText(/1 sent · 2 skipped/).waitFor();
  await ctx.close();
});

test('admin: WhatsApp service notice — WhatsApp Business not set up is explained; tap-to-send opens WhatsApp with the agent’s language and records it (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'admin', width: 390 });
  await page.getByTestId('tile-64').click();
  await page.getByTestId('bc-new').click();
  await page.getByTestId('bc-whatsapp').check();
  assert.equal(await page.getByTestId('bc-subject-en').count(), 0, 'no subject for WhatsApp');
  await page.getByTestId('bc-body-en').fill('Office closed on Friday.');
  await page.getByTestId('bc-body-bm').fill('Pejabat tutup pada hari Jumaat.');
  await page.getByTestId('bc-save').click();
  await page.getByTestId('bc-preview').getByText(/1 agent will get it now, of 3/).waitFor();
  assert.match(await page.getByTestId('bc-preview').innerText(), /1 have no WhatsApp number/);
  await page.getByTestId('bc-queue').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Holiday notice for everyone');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('bc-send-box').waitFor();
  await page.getByTestId('bc-send').click();
  await page.getByTestId('bc-send-error').getByText(/WhatsApp Business not set up: use tap-to-send/).waitFor();
  // WhatsApp itself is not reached in the test: the link the new tab opens is caught here.
  const opened = [];
  await ctx.route('https://wa.me/**', r => { opened.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: 'WhatsApp' }); });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('bc-wa-open').click()]);
  await popup.waitForLoadState();
  const u = new URL(opened[0]);
  assert.equal(u.hostname, 'wa.me'); assert.equal(u.pathname, '/60123456789');
  assert.equal(u.searchParams.get('text'), 'Pejabat tutup pada hari Jumaat.', 'Siti reads Bahasa Melayu');
  await popup.close();
  await page.getByTestId('bc-status').getByText('Done').waitFor();
  assert.ok(calls.some(c => c.fn === 'eab_admin_broadcast_wa_opened'));
  assert.match((await page.getByTestId('bc-recipient').allInnerTexts()).join('|'), /\+60 12-345 6789[\s\S]*Opened in WhatsApp/);
  await page.screenshot({ path: `${SHOTS}/51-whatsapp-phone.png`, fullPage: true });
  await ctx.close();
});

test('owner: weekly report — switch on (Monday 08:00, owner + compliance, reason), make one now, download the PDF, Vault "Check a file" knows it (laptop)', async () => {
  const { page, ctx, calls } = await open({ role: 'owner', width: 1366 });
  await page.getByTestId('tile-70').click();
  await page.getByTestId('report-settings').waitFor();
  await page.getByTestId('rep-on').check();
  assert.ok(await page.getByTestId('rep-save').isDisabled(), 'choose who gets it');
  for (const c of await page.getByTestId('rep-who').all()) await c.check();
  await page.getByTestId('rep-save').click();
  await page.getByText(/Every Monday from 08:00, to 2 admins/).waitFor();
  await page.getByPlaceholder(/At least 5 characters/).fill('Weekly summary for the team');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="rep-save"]')?.hasAttribute('disabled'));
  const set = calls.find(c => c.fn === 'eab_admin_report_settings_save').args;
  assert.equal(set.p.enabled, true); assert.equal(set.p.weekday, 1); assert.equal(set.p.hour, 8); assert.deepEqual(set.p.recipients.sort(), ['c9', 'me']);
  await page.getByTestId('rep-run').click();
  await page.getByPlaceholder(/At least 5 characters/).fill('Check the numbers today');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('confirm-final').click();
  await page.getByTestId('rep-msg').getByText(/Kept in the vault — email not set up/).waitFor();
  await page.getByTestId('rep-row').first().locator('.tag').getByText('Kept in the vault').waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rep-dl').first().click()]);
  assert.equal(dl.suggestedFilename(), 'EAB-weekly-RPT-2026-W43.pdf');
  assert.ok(calls.some(c => c.fn === 'storage_download' && c.args.path.startsWith('reports/')));
  await page.screenshot({ path: `${SHOTS}/52-reports-laptop.png`, fullPage: true });
  // the same file in "Check a file": not a case pack, but a weekly report
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-19').click();
  await page.getByTestId('vault-reports').waitFor();
  await page.getByTestId('check-file-input').setInputFiles(await dl.path());
  await page.getByTestId('check-file-ok').getByText(/weekly report made by Admin EAB/).waitFor();
  await ctx.close();
});

test('compliance: Team Workspaces and one workspace; To-Do asks Calendar or To-Do; ticks a shared task; shared event on the calendar (phone)', async () => {
  const { page, ctx, calls } = await open({ role: 'compliance', width: 390 });
  await page.getByTestId('tile-69').click();
  await page.getByTestId('team-row').getByText(/Siti Agent/).waitFor();
  assert.match(await page.getByTestId('team-row').innerText(), /Ali/);
  await page.getByTestId('ws-tab-own').click();
  await page.getByTestId('ws-open').click();
  await page.getByTestId('workspace').getByText(/Listings 2 · Contacts 3/).waitFor();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-13').click();
  await page.getByTestId('agenda-ask').waitFor();
  await page.getByTestId('agenda-todo').click();
  await page.getByTestId('task-row').getByText('Renew Supabase plan').waitFor();
  assert.match(await page.getByTestId('task-row').innerText(), /Team[\s\S]*Late · 2026-10-20[\s\S]*by kim@example.com/);
  await page.getByTestId('task-done').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="task-row"]')?.className.includes('done'));
  assert.deepEqual(calls.find(c => c.fn === 'eab_admin_task_save').args.p, { id: calls.find(c => c.fn === 'eab_admin_task_save').args.p.id, done: true });
  await page.getByTestId('task-title').fill('Prepare JPPH pack');
  await page.getByTestId('todo-shared').check();
  await page.getByTestId('task-add').click();
  await page.getByText('Prepare JPPH pack').waitFor();
  assert.equal(calls.filter(c => c.fn === 'eab_admin_task_save').at(-1).args.p.shared, true);
  await page.getByTestId('todo-tab-cal').click();
  await page.getByTestId('cal-grid').waitFor();
  await page.getByTestId('ev-new').click();
  await page.getByTestId('ev-title').fill('Compliance meeting');
  await page.getByTestId('todo-shared').check();
  await page.getByTestId('ev-save').click();
  await page.getByTestId('ev-row').getByText(/09:00–10:00 · Compliance meeting/).waitFor();
  const ev = calls.find(c => c.fn === 'eab_admin_event_save').args.p;
  assert.equal(ev.shared, true); assert.match(ev.starts_at, /T01:00:00\.000Z$/, '09:00 Malaysia = 01:00 UTC');
  await page.screenshot({ path: `${SHOTS}/53-calendar-phone.png`, fullPage: true });
  await ctx.close();
});

test('viewer: broadcast list without names, no new broadcast; no reports or workspaces; private to-do only; feature flags page explains tile. and beta. keys', async () => {
  const { page, ctx, b8 } = await open({ role: 'viewer', width: 390 });
  b8.st.broadcasts.push({ id: 'bv1', ref: 'BC-2026-0001', channel: 'email', kind: 'service', subject_en: 'Hello', body_en: 'x', audience: 'all', group_ids: [], status: 'done',
    created_by: 'me', created_at: b8.now, updated_at: b8.now, queued_at: b8.now, queued_by: 'me', claimed_at: b8.now, finished_at: b8.now });
  await page.getByTestId('tile-64').click();
  await page.getByTestId('bc-row').waitFor();
  assert.equal(await page.getByTestId('bc-new').count(), 0);
  assert.equal(await page.locator('button[data-testid="bc-row"]').count(), 0, 'rows do not open (names are not for viewers)');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  for (const n of [69, 70]) assert.equal(await page.getByTestId(`tile-${n}`).count(), 0, `tile ${n} closed for viewer`);
  await page.getByTestId('tile-13').click();
  await page.getByTestId('agenda-todo').click();
  await page.getByTestId('task-new').waitFor();
  assert.equal(await page.getByTestId('todo-shared').count(), 0, 'a Viewer makes private items only');
  assert.ok(await page.getByTestId('task-done').isDisabled(), 'a shared task is read-only for a Viewer');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('tile-67').click();
  const note = await page.getByTestId('flags-note').innerText();
  assert.match(note, /tile\.<card> switched OFF hides that card/); assert.match(note, /beta\.<name> switched ON/); assert.doesNotMatch(note, /does not read these switches yet/);
  await ctx.close();
});
