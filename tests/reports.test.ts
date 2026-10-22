import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardSections, cellText, cellValue, changeText, chartItems, draftProblems, draftToSpec, monthName, monthOptions, newDraft, opsFor, prevMonth,
  resultHeaders, specToDraft, yearOptions, Draft,
} from '../src/admin/reports';
import { auditCounts, buildAuditDoc, buildAuditSheets, buildBoardDoc, buildBoardSheets, buildCustomDoc, buildCustomSheets, specText, boardFileName, auditFileName, customFileName } from '../src/export/board';
import { can, ALL_ROLES } from '../src/admin/roles';
import { SECTIONS } from '../src/screens/features';
import { AuditBundle, BoardNumbers, BoardReport, ReportSource } from '../src/api/admin';

const listings: ReportSource = { label: 'Listings', date: 'created', columns: {
  agent_email: { t: 'text', p: true, l: 'Agent email' }, ref: { t: 'text', l: 'Reference' }, state: { t: 'text', l: 'State' },
  status: { t: 'text', l: 'Status' }, asking_price: { t: 'num', l: 'Asking price (RM)' }, created: { t: 'date', l: 'Created' }, deleted: { t: 'bool', l: 'Deleted' },
} };
const draft = (p: Partial<Draft> = {}): Draft => ({ ...newDraft('listings', listings, true), ...p });

test('filters that fit each kind of column (same as the database)', () => {
  assert.deepEqual(opsFor('text'), ['contains', 'eq', 'in', 'is']);
  assert.deepEqual(opsFor('num'), ['min', 'max', 'eq', 'is']);
  assert.deepEqual(opsFor('date'), ['after', 'before', 'is']);
  assert.deepEqual(opsFor('bool'), ['is']);
});

test('a draft becomes the spec sent to the database, and back', () => {
  const d = draft({ columns: ['ref', 'state', 'asking_price'], from: '2026-10-01', sortBy: 'ref', sortDir: 'asc', limit: 9000,
    filters: [{ col: 'state', op: 'in', value: 'Selangor, Johor ,' }, { col: 'asking_price', op: 'min', value: '500000' }, { col: 'ref', op: 'contains', value: '  ' }, { col: 'deleted', op: 'is', value: 'false' }] });
  const s = draftToSpec(d, listings);
  assert.deepEqual(s, { source: 'listings', limit: 5000, columns: ['ref', 'state', 'asking_price'], from: '2026-10-01',
    filters: [{ col: 'state', op: 'in', value: ['Selangor', 'Johor'] }, { col: 'asking_price', op: 'min', value: 500000 }, { col: 'deleted', op: 'is', value: 'false' }],
    sort: { by: 'ref', dir: 'asc' } });
  assert.equal(s.group_by, undefined, 'a list sends no grouping');
  const t = draftToSpec(draft({ mode: 'totals', group_by: ['state'], measure: 'sum:asking_price' }), listings);
  assert.deepEqual([t.group_by, t.measure, t.columns], [['state'], 'sum:asking_price', undefined]);
  const back = specToDraft(s);
  assert.equal(back.mode, 'rows'); assert.equal(back.filters[0].value, 'Selangor, Johor'); assert.equal(back.sortDir, 'asc');
  assert.equal(specToDraft(t).mode, 'totals');
});

test('draft checks: what a Viewer may not do, wrong numbers, dates and sorts', () => {
  assert.deepEqual(draftProblems(draft(), listings, true), []);
  const viewerStart = newDraft('listings', listings, false);
  assert.equal(viewerStart.mode, 'totals'); assert.ok(!viewerStart.group_by.includes('agent_email'));
  assert.deepEqual(draftProblems(viewerStart, listings, false), []);
  assert.ok(draftProblems(draft({ columns: ['ref'] }), listings, false).includes('Your role can only build totals (grouped counts).'));
  assert.ok(draftProblems(draft({ mode: 'totals', group_by: ['agent_email'] }), listings, false).includes('Names and emails are not shown to your role.'));
  assert.ok(draftProblems(draft({ mode: 'totals', group_by: ['state'], filters: [{ col: 'agent_email', op: 'contains', value: 'x' }] }), listings, false)
    .includes('Names and emails are not shown to your role.'));
  assert.ok(draftProblems(draft({ mode: 'totals', group_by: ['state'], measure: 'sum:state' }), listings, true).includes('A total or average needs a number column.'));
  assert.ok(draftProblems(draft({ mode: 'totals', group_by: [] }), listings, true).includes('Choose what to group by.'));
  assert.ok(draftProblems(draft({ columns: [] }), listings, true).includes('Tick at least one column.'));
  assert.ok(draftProblems(draft({ filters: [{ col: 'asking_price', op: 'min', value: 'lots' }] }), listings, true).includes('"Asking price (RM)" needs a number.'));
  assert.ok(draftProblems(draft({ filters: [{ col: 'state', op: 'min', value: '1' }] }), listings, true).includes('"State" cannot be filtered with "at least".'));
  assert.ok(draftProblems(draft({ from: '2026-10-05', to: '2026-10-01' }), listings, true).includes('"From" must be before "to".'));
  assert.ok(draftProblems(draft({ sortBy: 'status', columns: ['ref'] }), listings, true).includes('Sort by one of the chosen columns.'));
  assert.ok(draftProblems(draft({ limit: 0 }), listings, true).some(p => p.startsWith('Show between 1 and 5,000')));
  assert.deepEqual(draftProblems(draft(), undefined, true), ['Choose what the report is about.']);
});

test('cells in plain words; chart bars for a grouped report', () => {
  assert.equal(cellText(null, 'text'), '—');
  assert.equal(cellText(true, 'bool'), 'Yes'); assert.equal(cellText(false, 'bool'), 'No');
  assert.equal(cellText(1234567.5, 'num'), '1,234,567.5');
  assert.equal(cellText('booked_pending_spa', 'text', 'status').length > 0, true);
  assert.equal(cellText('fees', 'text', 'category'), 'Fees / commission');
  assert.equal(cellValue('42', 'num'), 42); assert.equal(cellValue(null, 'num'), '—');
  const spec = { source: 'listings', group_by: ['state', 'status'], measure: 'count' };
  assert.deepEqual(resultHeaders(spec, listings).map(h => h.label), ['State', 'Status', 'How many']);
  assert.deepEqual(resultHeaders({ source: 'listings', group_by: ['state'], measure: 'avg:asking_price' }, listings).at(-1)?.label, 'Average Asking price (RM)');
  const items = chartItems(spec, { rows: [{ state: 'Selangor', status: 'available', value: 7 }, { state: null, status: 'sold', value: 2 }], count: 2, truncated: false, run_at: '' }, listings);
  assert.deepEqual(items.map(i => [i.label, i.value]), [['Selangor · Available', 7], ['— · Sold', 2]]);
  assert.deepEqual(chartItems({ source: 'listings', columns: ['ref'] }, { rows: [{ ref: 'x' }], count: 1, truncated: false, run_at: '' }, listings), []);
});

test('this month against last month', () => {
  assert.equal(changeText(12, 10), '+2 (+20%)');
  assert.equal(changeText(5, 10), '−5 (−50%)');
  assert.equal(changeText(3, 3), 'same');
  assert.equal(changeText(4, 0), 'new');
  assert.equal(changeText(4, null), '');
  assert.equal(prevMonth('2026-01-01'), '2025-12-01');
  assert.equal(monthName('2026-09-01'), 'September 2026');
  assert.deepEqual(monthOptions('2026-03-15'), ['2026-03-01', '2026-02-01', '2026-01-01'], 'not before 2026');
  assert.equal(monthOptions('2027-12-02', 24).length, 24);
  assert.deepEqual(yearOptions('2028-01-01'), [2028, 2027, 2026]);
});

const nums = (k: number): BoardNumbers => ({
  from: k ? '2026-10-01' : '2026-09-01', to: k ? '2026-10-23' : '2026-09-30',
  agents: { total: 40 + k * 5, new: 3 + k * 2, active: 20 + k, not_active_now: 2, status_changes: k },
  licences: { total: 30, verified: 25, expired_at_end: k, expiring_60_after: 4, no_expiry_date: 3 },
  listings: { new: 10 + k, live_now: 120, sold: 2 + k, rented: 1, by_status_now: { available: 90, sold: 30 }, by_state_now: [{ state: 'Selangor', listings: 70 }] },
  complaints: { received: 2 * k, by_category: k ? { fees: 2 } : {}, resolved: 1, open_at_end: k },
  pdpa: { received: 3, by_kind: { access: 2, deletion: 1 }, with_deadline: 2, answered_in_21: 2 - k, late: k },
  tickets: { received: 5, fixed_or_closed: 4 },
  cases: { opened: 1, closed: k, by_requester: { police: 1 }, packs: 2 },
  admin: { actions: 50 + k, exports: 4, top_actions: [{ action: 'account_status', n: 3 + k }] },
});
const board: BoardReport = { month: '2026-10-01', month_end: '2026-10-31', complete: false, made_at: '2026-10-23T03:00:00Z', current: nums(1), previous: nums(0) };

test('Board report lines: compare columns, PDPA 21-day share, warnings; PDF and Excel', () => {
  const s = boardSections(board);
  assert.deepEqual(s.map(x => x.title), ['Agents', 'Licences', 'Listings', 'Complaints', 'PDPA requests', 'Problem reports', 'Regulator cases', 'Admin actions']);
  const agents = s[0].lines;
  assert.deepEqual([agents[1].label, agents[1].cur, agents[1].prev], ['New agents', 5, 3]);
  assert.equal(agents[4].prev, null, 'a count on the day has no comparison');
  const pdpa = s[4].lines;
  assert.ok(pdpa.find(l => l.label === 'Answered within 21 days')?.text === '50% (last: 100%)');
  assert.ok(pdpa.find(l => l.label.startsWith('Late'))?.warn);
  assert.ok(s[3].lines.some(l => l.label === 'Fees / commission' && l.cur === 2 && l.prev === 0 && l.sub));
  assert.ok(s[7].lines.some(l => l.label === 'Account status' && l.cur === 4 && l.prev === 3));
  const input = { reference: 'EAB-20261023-000010', createdAt: '2026-10-23T03:00:00Z', adminEmail: 'joe@example.com', companyName: 'JSL', contentSha: 'a'.repeat(64), report: board };
  const doc = buildBoardDoc(input);
  const txt = JSON.stringify(doc);
  assert.match(txt, /Monthly Board report/); assert.match(txt, /October 2026 \(so far, to 2026-10-23\)/); assert.match(txt, /last month 3/);
  assert.match(doc.footer ?? '', /EAB-20261023-000010 · Board report 2026-10/);
  assert.ok(!/@/.test(JSON.stringify(doc.blocks.slice(2))), 'no email of an agent in the numbers');
  const sh = buildBoardSheets(input);
  assert.deepEqual(sh[0].rows[0], ['Section', 'Line', 'October 2026', 'September 2026', 'Change', 'Note']);
  assert.ok(sh[0].rows.some(r => r[1] === 'New agents' && r[2] === 5 && r[3] === 3 && r[4] === '+2 (+67%)'));
  assert.equal(boardFileName('2026-10-01', 'EAB-1', 'pdf'), 'Board-report-2026-10-EAB-1.pdf');
});

const bundle: AuditBundle = {
  year: 2026, from: '2026-01-01', to: '2026-12-31', made_at: '2026-10-23T03:00:00Z', cap: 2,
  chain: { actions: { ok: true, checked: 3, first_bad_seq: null }, access: { ok: true, checked: 9, first_bad_seq: null } },
  counts: { actions: 3, access: 2 },
  actions: [{ seq: 1, at: '2026-10-01T00:00:00Z', admin_user: 'u', admin_email: 'joe@example.com', admin_role: 'owner', action: 'legal_hold_placed', target_user: 'a', target_ref: 'x', reason: 'Police', device: 'web', hash: 'h1' },
    { seq: 2, at: '2026-10-02T00:00:00Z', admin_user: 'u', admin_email: 'joe@example.com', admin_role: 'owner', action: 'report_saved', target_user: null, target_ref: 'y', reason: null, device: 'web', hash: 'h2' }],
  access: [{ seq: 5, at: '2026-10-02T00:00:00Z', admin_user: 'u', admin_email: 'joe@example.com', admin_role: 'owner', kind: 'export', target_user: null, target_ref: 'EAB-1', device: 'web', hash: 'h5' }],
  backup_tests: [{ id: 'b', ref: 'BT-2026-0001', tested_on: '2026-09-01', target: 'supabase', kind: 'restore_test', result: 'pass', what: 'restored', duration_minutes: 20, notes: null, recorded_by: 'u', recorded_by_email: 'joe@example.com', recorded_at: '' }],
  cases: [{ id: 'c', case_no: 'CASE-2026-0001', requester_type: 'police', requester_name: 'IPD', requester_ref: null, requester_contact: null, received_on: '2026-09-01', deadline: null,
    description: 'd', status: 'closed', outcome: null, created_by: 'u', created_at: '', updated_at: '', closed_at: '2026-09-10T00:00:00Z', agents: 1,
    packs: [{ reference: 'EAB-2', kind: 'case_pack', format: 'pdf', sha256: 'f'.repeat(64), content_sha256: null, created_at: '', stored: true }] }],
  vault: [{ reference: 'EAB-2', kind: 'case_pack', format: 'pdf', sha256: 'f'.repeat(64), created_at: '2026-09-02T00:00:00Z', stored: true }],
  pdpa: [{ id: 'p', ref: 'PDPA-2026-0001', agent_user: null, requester_name: 'Siti', requester_contact: null, received_on: '2026-09-01', kind: 'access', status: 'done',
    decision: null, decided_on: null, supplied_on: '2026-09-30', outcome: null, case_id: null, created_by: 'u', created_at: '', updated_at: '', agent_email: null, agent_on_hold: false, days_open: null }],
  complaints: [], holds: [{ id: 'h', agent_user: 'a', reason: 'Police', case_id: null, placed_by: 'u', placed_by_email: 'joe@example.com', placed_at: '2026-10-01T00:00:00Z',
    released_by: null, released_by_email: null, released_at: null, release_reason: null }],
  retention_reviews: [],
};

test('audit bundle: counts, the workbook (every list) and the PDF summary that names the workbook', () => {
  const c = auditCounts(bundle, '2026-10-23');
  assert.deepEqual([c.actions, c.actionsCut, c.access, c.accessCut, c.restoreTests, c.pdpaLate, c.holdsActive, c.chainOk], [3, true, 2, true, 1, 1, 1, true]);
  const input = { reference: 'EAB-20261023-000011', createdAt: '2026-10-23T03:00:00Z', adminEmail: 'joe@example.com', contentSha: 'b'.repeat(64), bundle };
  const sh = buildAuditSheets(input);
  assert.deepEqual(sh.map(s => s.name), ['Summary', 'Admin actions', 'Access log', 'Tamper check', 'Backup tests', 'Cases & packs', 'Vault files', 'PDPA', 'Complaints', 'Legal holds', 'Retention reviews']);
  assert.ok(sh[0].rows.some(r => r[0] === 'Admin actions in the year' && /first 2 in this workbook/.test(String(r[1]))));
  assert.equal(sh[1].rows[1][4], 'Legal hold placed'); assert.equal(sh[1].rows[1][9], 'h1');
  assert.ok(sh[5].rows.some(r => r[7] === 'EAB-2' && r[10] === 'f'.repeat(64)));
  assert.equal(sh[7].rows[1][7], 29); assert.equal(sh[7].rows[1][8], 'Yes', '29 days = over 21');
  assert.equal(sh[9].rows[1][4], 'still in force');
  const doc = buildAuditDoc(input, { reference: 'EAB-WB', sha256: 'c'.repeat(64) });
  const txt = JSON.stringify(doc);
  assert.match(txt, /Annual audit bundle 2026/); assert.match(txt, /EAB-WB/); assert.match(txt, /c{64}/); assert.match(txt, /chain unbroken/);
  assert.match(txt, /workbook holds the first 2/);
  assert.equal(auditFileName(2026, 'EAB-9', 'xlsx'), 'Audit-bundle-2026-workbook-EAB-9.xlsx');
  assert.equal(auditFileName(2026, 'EAB-9', 'pdf'), 'Audit-bundle-2026-summary-EAB-9.pdf');
});

test('custom report files: settings in words, rows, numbers stay numbers in Excel', () => {
  const spec = { source: 'listings', group_by: ['state'], measure: 'sum:asking_price', from: '2026-10-01', filters: [{ col: 'deleted', op: 'is' as const, value: 'false' }], sort: { by: 'value', dir: 'desc' as const } };
  assert.deepEqual(specText(spec, listings), ['Listings', 'grouped by State · Total Asking price (RM)', 'Created from 2026-10-01', 'Deleted is No', 'sorted by Total Asking price (RM) (highest first)']);
  const result = { rows: [{ state: 'Selangor', value: 1400000 }, { state: 'Johor', value: 500000 }], count: 2, truncated: false, run_at: '' };
  const input = { reference: 'EAB-3', createdAt: '2026-10-23T03:00:00Z', adminEmail: 'joe@example.com', name: 'Value by state', spec, src: listings, result };
  const doc = buildCustomDoc(input);
  assert.match(JSON.stringify(doc), /"k":"Selangor","v":"1,400,000"/);
  const sh = buildCustomSheets(input);
  assert.deepEqual(sh[0].rows, [['State', 'Total Asking price (RM)'], ['Selangor', 1400000], ['Johor', 500000]]);
  const rows = buildCustomDoc({ ...input, spec: { source: 'listings', columns: ['ref', 'state'] }, result: { rows: [{ ref: 'P1', state: 'Selangor' }], count: 1, truncated: true, run_at: '' } });
  assert.match(JSON.stringify(rows), /"k":"P1","v":"State: Selangor"/); assert.match(JSON.stringify(rows), /more exist/);
  assert.equal(customFileName('Value by state / 2026', 'EAB-3', 'xlsx'), 'Report-Value-by-state-2026-EAB-3.xlsx');
});

test('roles mirror the database; report tiles open', () => {
  const rule: Record<string, string[]> = {
    boardReport: ['owner', 'compliance'], auditBundle: ['owner', 'compliance'],
    reportBuilder: ['owner', 'admin', 'compliance', 'viewer'], reportNames: ['owner', 'admin', 'compliance'],
  };
  for (const [ab, roles] of Object.entries(rule)) for (const r of ALL_ROLES) assert.equal(can(r, ab as never), roles.includes(r), `${ab} ${r}`);
  const open = new Map(SECTIONS.flatMap(s => s.items).filter(f => f.open).map(f => [String(f.n), f]));
  for (const n of ['90', '127', '129']) assert.equal(open.get(n)?.open?.k, 'reports', n);
});
