import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_REASONS, MALAYSIA, PHOTO_REASONS, bubbleSize, channelLabel, cluster, contactRoleLabel, dotClass, fitView, fmtBytes, fmtPpsf, humanize,
  modReasonLabel, modStatusLabel, modStatusTag, project, tilesFor, toScreen, unproject,
} from '../src/admin/content';
import { buildContentDoc, buildContentSheets, buildModerationSheets, contentFileName, ContentReportInput } from '../src/export/content';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';

test('labels: reasons, statuses, roles, channels; unknown keys read as words', () => {
  assert.equal(modReasonLabel('price_far'), 'Price far from the area');
  assert.equal(modReasonLabel('brand_new_reason'), 'Brand new reason');
  assert.equal(modStatusLabel('referred'), 'Referred to a complaint');
  assert.equal(modStatusTag('open'), 'amber'); assert.equal(modStatusTag('cleared'), 'ok'); assert.equal(modStatusTag('confirmed'), 'red');
  assert.equal(contactRoleLabel('vendor'), 'Vendors (owners)'); assert.equal(contactRoleLabel('investor'), 'Investor');
  assert.equal(channelLabel('whatsapp'), 'WhatsApp'); assert.equal(channelLabel('not_set'), 'Not set');
  assert.equal(humanize('pending_info'), 'Pending info'); assert.equal(humanize(''), '—');
  for (const r of [...LISTING_REASONS, ...PHOTO_REASONS]) assert.ok(!modReasonLabel(r).includes('_'), r);
  assert.ok(PHOTO_REASONS.includes('offensive_photo') && !LISTING_REASONS.includes('offensive_photo'));
});

test('money and sizes', () => {
  assert.equal(fmtPpsf(305), 'RM 305 psf'); assert.equal(fmtPpsf(305.456), 'RM 305.46 psf'); assert.equal(fmtPpsf(null), '—');
  assert.equal(fmtBytes(512), '512 B'); assert.equal(fmtBytes(220287), '215 KB'); assert.equal(fmtBytes(3 * 1024 * 1024), '3 MB'); assert.equal(fmtBytes(null), '—');
});

test('map maths: project / unproject round trip; Kuala Lumpur lands on the right tile', () => {
  const kl = { lat: 3.139, lng: 101.6869 };
  for (const z of [3, 8, 14, 17]) {
    const back = unproject(project(kl.lat, kl.lng, z), z);
    assert.ok(Math.abs(back.lat - kl.lat) < 1e-6 && Math.abs(back.lng - kl.lng) < 1e-6, `zoom ${z}`);
  }
  const p = project(kl.lat, kl.lng, 10);
  assert.equal(Math.floor(p.x / 256), 801); assert.equal(Math.floor(p.y / 256), 503);  // OSM tile 10/801/503 covers KL
  assert.ok(Number.isFinite(project(89.9, 0, 5).y), 'poles are clamped');
});

test('fitView: all points fit; one point is not zoomed in too far; nothing = Malaysia', () => {
  const pts = [{ lat: 3.1, lng: 101.6 }, { lat: 1.5, lng: 103.7 }, { lat: 5.4, lng: 100.3 }];
  const v = fitView(pts, 360, 360);
  for (const q of pts) {
    const s = toScreen(q.lat, q.lng, v, 360, 360);
    assert.ok(s.x >= 0 && s.x <= 360 && s.y >= 0 && s.y <= 360, `${q.lat},${q.lng} on screen`);
  }
  assert.ok(fitView([{ lat: 3.1, lng: 101.6 }], 360, 360).z <= 14);
  const my = fitView([], 380, 360);
  assert.ok(my.lat > MALAYSIA.south && my.lat < MALAYSIA.north && my.lng > MALAYSIA.west && my.lng < MALAYSIA.east);
  assert.ok(my.z >= 3 && my.z <= 6);
});

test('tilesFor covers the whole box and wraps x around the world', () => {
  const v = { lat: 3.1, lng: 101.6, z: 6 };
  const t = tilesFor(v, 400, 300);
  assert.ok(t.length >= 4 && t.length <= 9);
  assert.ok(t.some(x => x.left <= 0) && t.some(x => x.left + 256 >= 400) && t.some(x => x.top <= 0) && t.some(x => x.top + 256 >= 300));
  const edge = tilesFor({ lat: 0, lng: 179.9, z: 3 }, 600, 200);
  assert.ok(edge.every(x => x.x >= 0 && x.x < 8), 'x wraps into 0..2^z-1');
});

test('cluster: close points join one bubble with the summed weight; far points stay apart; off-screen points are left out', () => {
  const v = { lat: 3.1, lng: 101.6, z: 10 };
  const pts = [{ lat: 3.1, lng: 101.6, w: 3 }, { lat: 3.1001, lng: 101.6001, w: 4 }, { lat: 3.2, lng: 101.75, w: 1 }, { lat: 10, lng: 120, w: 9 }];
  const b = cluster(pts, v, 400, 400, 34, p => p.w);
  assert.equal(b.length, 2);
  assert.deepEqual(b.map(x => x.weight).sort((a, c) => a - c), [1, 7]);
  assert.equal(bubbleSize(1), 26); assert.ok(bubbleSize(1000) <= 52); assert.ok(bubbleSize(8) > bubbleSize(2));
  assert.equal(dotClass('available'), 'avail'); assert.equal(dotClass('booked_pending_loan'), 'booked'); assert.equal(dotClass('sold'), 'closed'); assert.equal(dotClass('x'), 'other');
});

test('roles: moderation is staff only; content insight is open to viewers but not regulators', () => {
  const staff = ALL_ROLES.filter(r => can(r, 'moderate'));
  assert.deepEqual(staff.sort(), ['admin', 'compliance', 'owner']);
  assert.ok(can('viewer', 'viewMarket') && !can('viewer', 'viewMarketAgents') && !can('regulator', 'viewMarket'));
});

test('home tiles: the nine AdminBatch010 features open; nothing in Content & Business is "Coming soon" any more', () => {
  const all = SECTIONS.flatMap(s => s.items);
  for (const n of [8, 16, 28, 54, 55, 56, 57, 60, 61]) {
    const f = all.find(x => x.n === n);
    assert.ok(f?.open && f.needs, `feature ${n} opens`);
  }
  const content = SECTIONS.find(s => s.title === 'Content & Business')!;
  assert.ok(content.items.every(f => f.open || f.blocked), 'no coming-soon tile left in Content & Business');
  assert.ok(SECTIONS.find(s => s.title === 'Compliance')!.items.every(f => f.open || f.blocked));
  assert.equal(all.find(x => x.n === 16)!.needs, 'moderate');
  assert.equal(all.find(x => x.n === 54)!.needs, 'viewMarket');
});

const input = (): ContentReportInput => ({
  reference: 'EAB-20261030-000001', createdAt: '2026-10-30T02:00:00Z', adminEmail: 'owner@example.com', companyName: 'JSL Global Trading', from: '2026-08-01', to: '2026-10-30',
  data: {
    map: { scope: 'open', listings: 5, with_pin: 3, names_hidden: false, states: ['Selangor'], types: ['Terrace'], points: [
      { lat: 3.1, lng: 101.6, status: 'available', type: 'Terrace', side: 'sale', price: 500000, state: 'Selangor', city: 'Kajang', ref: 'P1001', email: 'agent@example.com' }] },
    geo: { agents: 9, with_listings: 6, with_place: 5, by_country: [{ country: 'Malaysia', agents: 8 }, { country: 'Singapore', agents: 1 }],
      by_state: [{ state: 'Selangor', agents: 5 }], by_city: [{ state: 'Selangor', city: 'Kajang', agents: 3 }], cells: [{ lat: 3.1, lng: 101.6, agents: 4 }], cells_hidden: 1 },
    contacts: { from: '2026-08-01', to: '2026-10-30', contacts: 7, new_in_period: 2, by_role: [{ role: 'vendor', contacts: 6, new: 1 }, { role: 'buyer', contacts: 2, new: 1 }],
      vendor_status: { pending_info: 2, not_set: 4 }, vendors: 6, vendors_with_listing: 3, buyers: 2, in_a_deal: 1, by_month: [{ month: '2026-10', buyers: 1, vendors: 1, others: 0 }],
      enquiries: 3, enquiries_by_channel: [{ channel: 'whatsapp', enquiries: 2 }], enquiries_with_contact: 2, agents_with_buyers: 1, names_hidden: false,
      agents: [{ user_id: 'u1', email: 'agent@example.com', name: 'Siti', contacts: 7, buyers: 2, vendors: 6, new: 2, enquiries: 3 }] },
    trends: { months: 12, since: '2025-11-01', listings: 10, no_date: 0, states: ['Selangor'], cities: [{ state: 'Selangor', city: 'Kajang' }], types: ['Terrace'],
      sale: { listings: 8, median_price: 520000, median_ppsf: 305 }, rent: { listings: 2, median_rent: 2500 },
      by_month: [{ month: '2026-10', sale_listings: 3, median_price: 500000, median_ppsf: 300, rent_listings: 1, median_rent: 2400 }],
      by_area: [{ state: 'Selangor', city: 'Kajang', listings: 6, median_price: 500000, median_ppsf: 300, recent_ppsf: 310, before_ppsf: 290, change_pct: 6.9 }],
      by_type: [{ type: 'Terrace', listings: 6, median_price: 500000, median_ppsf: 300, median_rent: null }] },
    ai: { from: '2026-08-01', to: '2026-10-30', commands: 8, understood: 6, not_understood: 2, success_pct: 75, agents: 2, screen_opens: 9, screen_agents: 2,
      by_day: [{ day: '2026-10-29', understood: 3, not_understood: 1 }], by_version: [{ version: '2.2.0', commands: 8, not_understood: 2, success_pct: 75 }],
      by_language: [{ language: 'ms', commands: 3, not_understood: 2, success_pct: 33.3 }], heatmap: [], names_hidden: false,
      list: [{ user_id: 'u1', email: 'agent@example.com', name: 'Siti', commands: 8, not_understood: 2, success_pct: 75, last_at: '2026-10-29T03:00:00Z' }] },
    studio: { from: '2026-08-01', to: '2026-10-30', opened: 22, created: 13, saved: 8, shared: 4, agents: 3, makers: 2, share_pct: 30.8,
      by_day: [{ day: '2026-10-29', created: 2, saved: 1, shared: 1 }], names_hidden: false,
      list: [{ user_id: 'u1', email: 'agent@example.com', name: 'Siti', opened: 10, created: 6, saved: 4, shared: 2, last_at: '2026-10-29T03:00:00Z' }] },
  },
});

test('content report: PDF blocks and Excel sheets carry every tab; no contact names', () => {
  const doc = buildContentDoc(input());
  const text = JSON.stringify(doc);
  for (const h of ['Listings on the map', 'Where agents are', 'Buyers and vendors', 'Price trends', 'AI Assisted Command', 'Marketing Studio']) assert.ok(text.includes(h), h);
  assert.ok(text.includes('EAB-20261030-000001') && text.includes('Singapore') && text.includes('RM 305 psf') && text.includes('+6.9%') && text.includes('75%'));
  assert.ok(doc.footer?.includes('Content insight 2026-08-01 to 2026-10-30'));
  const sheets = buildContentSheets(input());
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'Map listings', 'Geography', 'Buyers & vendors', 'Price trends', 'AI commands', 'Marketing Studio']);
  assert.deepEqual(sheets[1].rows[1].slice(0, 3), ['P1001', '', 'Terrace']);
  for (const s of sheets) for (const r of s.rows) assert.ok(r.length <= s.widths!.length, `${s.name}: row wider than its columns`);
  assert.equal(contentFileName('EAB-1', 'xlsx'), 'Content-EAB-1.xlsx');
});

test('moderation register: cases and automatic checks sheets', () => {
  const sheets = buildModerationSheets({ reference: 'EAB-X', createdAt: '2026-10-30T02:00:00Z', adminEmail: 'c@example.com',
    cases: { counts: { open: 1 }, by_reason: { price_far: 1 }, cases: [{ id: 'm1', ref: 'MOD-2026-0001', kind: 'listing', agent_user: 'u1', workspace_id: null, record_id: 'p1',
      listing_ref: 'P1001', file_sha: null, reason: 'price_far', source: 'suspect', summary: 'Too cheap', status: 'open', outcome: null, complaint_id: null,
      created_at: '2026-10-30T01:00:00Z', updated_at: '2026-10-30T01:00:00Z', agent_email: 'agent@example.com', agent_name: 'Siti' }] },
    suspects: { checked: 4, counts: { no_title_type: 1 }, listings: [{ user_id: 'u1', email: 'agent@example.com', name: 'Siti', id: 'p2', ref: 'P1002', headline: null, type: 'Condo',
      state: 'Selangor', city: 'Cheras', status: 'available', asking: 400000, rent: null, photos: 0, updated_at: '2026-10-30T01:00:00Z',
      reasons: [{ reason: 'no_title_type', detail: 'no title type', case_ref: null }] }] } });
  assert.deepEqual(sheets.map(s => s.name), ['Cases', 'Automatic checks', 'About']);
  assert.deepEqual(sheets[0].rows[1].slice(0, 4), ['MOD-2026-0001', 'Open', 'listing', 'Price far from the area']);
  assert.match(String(sheets[1].rows[1][5]), /No title type: no title type/);
});
