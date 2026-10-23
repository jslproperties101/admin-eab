import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STUCK_DAYS, bandOf, fmtDays, fmtHours, fmtRm, fmtSignedPct, heatShade, missingLabel, monthLabel, qualityScore, slotLabel, stageLabel,
} from '../src/admin/market';
import { buildMarketDoc, buildMarketSheets, marketFileName, MarketReportInput } from '../src/export/market';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';

test('quality score: same rule as the database (eab_mkt_score) — full, empty, land lot, few photos', () => {
  const full = { photos: [1, 2, 3, 4, 5], askingPrice: '1000', titleType: 'x', tenure: 'y', landSqft: 10, bedrooms: 1, state: 's', city: 'c', lat: 1, lng: 2 };
  assert.deepEqual(qualityScore(full), { score: 100, photos: 5, missing: [] });
  const empty = qualityScore({});
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.missing, ['photos', 'price', 'title_type', 'tenure', 'size', 'rooms', 'location', 'map_pin']);
  // land: rooms are free; one photo = 15; state + city = 10  → 35 (the database test expects 35 too)
  assert.equal(qualityScore({ photos: [1], type: 'Residential land', state: 's', city: 'c' }).score, 35);
  assert.ok(qualityScore({ photos: [1] }).missing.includes('more_photos'));
  // monthly rent counts as a price; blank strings do not count; a text number counts
  assert.equal(qualityScore({ monthlyRent: 2500 }).score, 15);
  assert.equal(qualityScore({ titleType: '  ', tenure: '' }).score, 0);
  assert.equal(qualityScore({ askingPrice: 'abc' }).score, 0);
  assert.equal(qualityScore({ lat: 3.1 }).score, 0, 'a pin needs both lat and lng');
});

test('bands, money, percentages, days, hours, months, best-time slots', () => {
  assert.equal(bandOf(100), 'good'); assert.equal(bandOf(80), 'good'); assert.equal(bandOf(79), 'fair'); assert.equal(bandOf(50), 'fair'); assert.equal(bandOf(49), 'poor');
  assert.equal(fmtRm(28500), 'RM 28,500'); assert.equal(fmtRm(null), '—');
  assert.equal(fmtRm(1_250_000, true), 'RM 1.25m'); assert.equal(fmtRm(28_500, true), 'RM 28.5k'); assert.equal(fmtRm(900, true), 'RM 900');
  assert.equal(fmtSignedPct(-5), '-5%'); assert.equal(fmtSignedPct(3.46), '+3.5%'); assert.equal(fmtSignedPct(0), '0%'); assert.equal(fmtSignedPct(null), '—');
  assert.equal(fmtDays(99.6), '100 d'); assert.equal(fmtDays(null), '—');
  assert.equal(fmtHours(0.5), '30 min'); assert.equal(fmtHours(3.54), '3.5 h'); assert.equal(fmtHours(72), '3 days');
  assert.equal(monthLabel('2026-11'), 'Nov 2026'); assert.equal(monthLabel('bad'), 'bad');
  assert.equal(slotLabel(1, 9), 'Mon 09:00-10:00'); assert.equal(slotLabel(7, 23), 'Sun 23:00-00:00');
  assert.equal(heatShade(0), undefined); assert.equal(heatShade(1), 'rgba(212, 175, 55, 1.00)');
  assert.equal(stageLabel('not_linked'), 'Not linked to a listing'); assert.equal(stageLabel('booked_pending_loan'), 'Booked - Pending Loan');
  assert.equal(missingLabel('photos'), 'No photos');
  assert.equal(STUCK_DAYS, 30, 'Joe, 23 Oct 2026');
});

test('roles mirror the database: market totals for staff + viewer; names for owner / admin / compliance only', () => {
  for (const r of ALL_ROLES) {
    assert.equal(can(r, 'viewMarket'), ['owner', 'admin', 'compliance', 'viewer'].includes(r), r);
    assert.equal(can(r, 'viewMarketAgents'), ['owner', 'admin', 'compliance'].includes(r), r);
  }
});

test('home tiles: 102-105 and 107-110 open the Market tabs; 106 is blocked until the main app records buyer requirements', () => {
  const sec = SECTIONS.find(s => s.title === 'Listings & Market');
  assert.ok(sec);
  const by = new Map(sec!.items.map(i => [i.n, i]));
  const tabs: Record<number, string> = { 102: 'quality', 103: 'dom', 104: 'price', 105: 'areas', 107: 'stuck', 108: 'commission', 109: 'projects', 110: 'news' };
  for (const [n, tab] of Object.entries(tabs)) {
    const f = by.get(Number(n));
    assert.deepEqual(f?.open, { k: 'market', tab }, `tile ${n}`);
    assert.equal(f?.needs, 'viewMarket');
  }
  assert.ok(by.get(106)?.blocked && !by.get(106)?.open);
  // every number appears once across the whole home screen
  const all = SECTIONS.flatMap(s => s.items.map(i => String(i.n)));
  assert.equal(new Set(all).size, all.length);
});

const input = (names: boolean): MarketReportInput => ({
  reference: 'EAB-20261023-000009', createdAt: '2026-10-23T05:00:00Z', adminEmail: 'joe@example.com', companyName: 'JSL Global Trading', from: '2026-07-26', to: '2026-10-23',
  data: {
    quality: { listings: 3, average: 61.7, bands: { good: 1, fair: 1, poor: 1 }, missing: { photos: 1, map_pin: 2 }, by_state: [{ state: 'Selangor', listings: 3, average: 61.7 }],
      below: 80, weak_count: 2, names_hidden: !names,
      weak: names ? [{ user_id: 'u1', email: 'siti@example.com', name: 'Siti Agent', id: 'p1', ref: 'P1001', headline: 'Terrace', type: 'Terrace house', state: 'Selangor', city: 'Kajang',
        status: 'available', score: 35, photos: 0, missing: ['photos', 'map_pin'], updated_at: '2026-10-20T00:00:00Z' }] : null },
    dom: { from: '2026-07-26', to: '2026-10-23', no_date: 0, open: { listings: 2, median: 100, average: 100, buckets: { under_30: 0, d30_89: 0, d90_179: 2, d180_plus: 0 } },
      closed: { listings: 1, median: 100 }, by_state: [{ state: 'Selangor', open: 2, median: 100, average: 100, oldest: 100, closed: 1, closed_median: 100 }],
      by_city: [{ state: 'Selangor', city: 'Kajang', open: 2, median: 100, average: 100, oldest: 100, closed: 1, closed_median: 100 }], by_type: [] },
    price: { from: '2026-07-26', to: '2026-10-23', deals: 2, compared: 1, not_linked: 1, no_price: 0, average_pct: -5, median_pct: -5, below: 1, at: 0, above: 0,
      by_side: [{ side: 'sale', deals: 1, average_pct: -5, median_pct: -5 }], by_state: [{ state: 'Selangor', deals: 1, average_pct: -5, median_pct: -5 }], by_type: [],
      names_hidden: !names, list: names ? [{ user_id: 'u1', email: 'siti@example.com', name: 'Siti Agent', deal_id: 'd1', date: '2026-10-20', side: 'sale', ref: 'P1001',
        headline: null, type: null, state: 'Selangor', city: 'Kajang', asking: 1000000, final: 950000, pct: -5 }] : null },
    areas: { from: '2026-07-26', to: '2026-10-23', on_market: 2, new: 1, closed: 1, enquiries: 3, enquiries_unlinked: 1,
      by_state: [{ state: 'Selangor', on_market: 2, new: 1, closed: 1, enquiries: 2, per_listing: 1 }],
      by_city: [{ state: 'Selangor', city: 'Kajang', on_market: 2, new: 1, closed: 1, enquiries: 2, per_listing: 1, supply_level: 1, demand_level: 1 }] },
    stuck: { days: 30, booked: 2, stuck_count: 1, by_stage: [{ stage: 'booked_pending_loan', booked: 1, stuck: 1, oldest: 40 }], names_hidden: !names,
      list: names ? [{ user_id: 'u1', email: 'siti@example.com', name: 'Siti Agent', id: 'p9', ref: 'P1009', headline: null, type: null, state: null, city: null,
        stage: 'booked_pending_loan', asking: 800000, updated_at: '2026-09-13T00:00:00Z', days: 40 }] : null },
    commission: { from: '2026-07-26', to: '2026-10-23', open: { deals: 2, value: 953000, commission: 31500, agents_share: 30000, estimated: 28500, confirmed: 3000, overdue: 0, no_date: 0 },
      received: { deals: 1, commission: 8000, agents_share: 8000 }, by_month: [{ month: '2026-11', deals: 1, estimated: 28500, confirmed: 0, commission: 28500 }],
      by_side: [{ side: 'sale', deals: 1, value: 950000, commission: 28500 }], by_stage: [{ stage: 'available', deals: 1, commission: 28500 }], names_hidden: !names,
      agents: names ? [{ user_id: 'u1', email: 'siti@example.com', name: 'Siti Agent', deals: 2, commission: 31500, agents_share: 30000, next_date: '2026-11-12' }] : null },
    projects: { from: '2026-07-26', to: '2026-10-23', projects: 1, reached: 1, opened: 1, redeemed: 1,
      list: [{ id: 'f9', title: 'Eco Park', developer: 'TEST Dev', status: 'published', published_at: '2026-10-22T00:00:00Z', expires_at: null, audience: 'codes', reached: 1, opened: 1, open_pct: 100, redeemed: 1, codes: 1 }],
      by_day: [{ day: '2026-10-23', opened: 1, redeemed: 1 }] },
    news: { from: '2026-07-26', to: '2026-10-23', posts: 1, reached: 6, opened: 3, open_pct: 50, with_alert: { posts: 1, open_pct: 50 }, without_alert: { posts: 0, open_pct: null },
      list: [{ id: 'n1', title: 'OPR cut', published_at: '2026-10-21T02:00:00Z', audience: 'all', push_alert: true, reached: 6, opened: 3, open_pct: 50, median_hours: 1.5 }],
      by_language: [{ language: 'en', reached: 4, opened: 2, open_pct: 50 }, { language: 'ms', reached: 2, opened: 1, open_pct: 50 }],
      by_group: [{ group_id: 'g1', group: 'Selangor RENs', priority: 1, reached: 3, opened: 2, open_pct: 66.7 }],
      heatmap: [{ dow: 2, hour: 9, events: 2 }], best: [{ dow: 2, hour: 9, opens: 2 }] },
  },
});

test('report: PDF blocks and Excel sheets cover every tab, carry the reference, and name agents only when the lists came back', () => {
  const doc = buildMarketDoc(input(true));
  const text = JSON.stringify(doc.blocks);
  assert.match(doc.footer ?? '', /EAB-20261023-000009/);
  for (const h of ['Listing quality', 'Days on market', 'Asking vs final price', 'Hot areas', 'Stuck deals', 'Commission forecast', 'Pushed projects', 'Market News engagement'])
    assert.ok(text.includes(h), h);
  assert.match(text, /Siti Agent/); assert.match(text, /Tue 09:00-10:00/); assert.match(text, /-5%/);
  assert.doesNotMatch(text, /[→’]/, 'plain characters for the PDF');
  const sheets = buildMarketSheets(input(true));
  assert.deepEqual(sheets.map(s => s.name), ['Summary', 'Quality', 'Days on market', 'Asking vs final', 'Hot areas', 'Stuck deals', 'Commission', 'Projects', 'News']);
  assert.equal(sheets[0].rows[0][1], 'EAB-20261023-000009');
  assert.deepEqual(sheets[3].rows[1].slice(-3), [1000000, 950000, -5]);
  const hidden = JSON.stringify([buildMarketDoc(input(false)).blocks, buildMarketSheets(input(false))]);
  assert.doesNotMatch(hidden, /siti@example\.com|Siti Agent/);
  assert.equal(marketFileName('EAB-1', 'xlsx'), 'Market-EAB-1.xlsx');
});
