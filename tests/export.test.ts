import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx, colName, crc32, safeSheetName, workbookFiles } from '../src/export/xlsx';
import { buildProfileDoc, buildProfileSheets, diff, exportFileName, fieldLabel, fmtTime, historyLines, recordFields, valueText } from '../src/export/reports';
import { AgentProfile, AgentRecord, Version } from '../src/api/admin';
import { layoutDocument } from '../src/lib/pdf';

test('xlsx: column names, sheet names, CRC', () => {
  assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(701), 'ZZ'); assert.equal(colName(702), 'AAA');
  const used = new Set<string>();
  assert.equal(safeSheetName('Listings', used), 'Listings');
  assert.equal(safeSheetName('listings', used), 'listings (2)');
  assert.equal(safeSheetName('a/b:c', used), 'a b c');
  assert.ok(safeSheetName('x'.repeat(40), used).length <= 31);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('xlsx: a valid ZIP with the parts Excel needs, text escaped, numbers as numbers', () => {
  const files = workbookFiles([{ name: 'S', rows: [['H1', 'H2'], ['<a & "b">', 42], ['中文 Bahasa', null]] }]);
  assert.ok(files['[Content_Types].xml'].includes('sheet1.xml'));
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('&lt;a &amp; &quot;b&quot;&gt;'));
  assert.ok(sheet.includes('<c r="B2"><v>42</v></c>'));
  assert.ok(sheet.includes('中文 Bahasa'));
  const zip = buildXlsx([{ name: 'S', rows: [['a']] }]);
  const v = new DataView(zip.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);                 // first local header
  assert.equal(v.getUint32(zip.length - 22, true), 0x06054b50);   // end of central directory
  assert.equal(v.getUint16(zip.length - 22 + 10, true), Object.keys(workbookFiles([{ name: 'S', rows: [['a']] }])).length);
});

const profile: AgentProfile = {
  user_id: 'u1', email: 'agent@example.com', name: 'Test Agent', joined_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-20T06:00:00Z',
  banned_until: null, deleted_at: null, status: 'active', licence: null, workspaces: [{ id: 'w', name: 'Mine', role: 'owner' }],
  counts: { contacts: { total: 1, deleted: 0 }, properties: { total: 2, deleted: 1 } },
};
const rec = (id: string, data: Record<string, unknown>, deleted = false, rev = 1): AgentRecord =>
  ({ workspace_id: 'w', collection: 'properties', id, data, deleted, rev, written_at: '2026-10-20T06:00:00Z', written_by: 'u1' });

test('reports: readable labels and values', () => {
  assert.equal(fieldLabel('askingPrice'), 'Asking price');
  assert.equal(fieldLabel('refNo'), 'Ref number');
  assert.equal(valueText('points', [1, 2, 3]), '3 GPS points');
  assert.equal(valueText('negotiable', true), 'Yes');
  assert.equal(valueText('created', 1760940000000), fmtTime(new Date(1760940000000).toISOString()));
  assert.equal(fmtTime('2026-10-20T06:00:00Z'), '2026-10-20 14:00 MYT');
  const f = recordFields(rec('p1', { street: 'Jalan 1', ref: 'P1001', zeta: 'z', askingPrice: 500000 }));
  assert.deepEqual(f.map(x => x.k), ['Ref', 'Asking price', 'Street', 'Zeta']);
});

test('reports: change history lists before → after per field', () => {
  const vs: Version[] = [
    { rev: 2, data: { askingPrice: 480000, status: 'Booked', updated: 2 }, deleted: false, saved_by: 'u', saved_at: '2026-10-20T07:00:00Z', current: true },
    { rev: 1, data: { askingPrice: 500000, status: 'Available', updated: 1 }, deleted: false, saved_by: 'u', saved_at: '2026-10-20T06:00:00Z', current: false },
  ];
  const lines = historyLines(vs);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^v1 → v2 \(2026-10-20 15:00 MYT\): Asking price 500000 → 480000; Status Available → Booked$/);
  assert.deepEqual(diff({ a: 1, updated: 1 }, { a: 1, updated: 2 }), []); // the "updated" stamp alone is not a change
});

test('reports: PDF and Excel include deleted records, reference and history', () => {
  const input = {
    reference: 'EAB-20261021-000001', createdAt: '2026-10-20T18:00:00Z', adminEmail: 'joe@example.com', profile,
    records: { properties: [rec('p1', { ref: 'P1001' }), rec('p2', { ref: 'P1002' }, true, 2)], contacts: [{ ...rec('c1', { name: 'Ali' }), collection: 'contacts' }] },
    histories: { 'properties/p2': [
      { rev: 2, data: { ref: 'P1002' }, deleted: true, saved_by: 'u', saved_at: '2026-10-20T07:00:00Z', current: true },
      { rev: 1, data: { ref: 'P1002' }, deleted: false, saved_by: 'u', saved_at: '2026-10-20T06:00:00Z', current: false }] as Version[] },
  };
  const doc = buildProfileDoc(input);
  const text = JSON.stringify(doc.blocks);
  assert.ok(text.includes('EAB-20261021-000001'));
  assert.ok(text.includes('DELETED (kept for audit)'));
  assert.ok(text.includes('Deleted No → Yes'));
  assert.ok(text.indexOf('Listings') < text.indexOf('Contacts'), 'listings come first');
  assert.ok(doc.footer?.includes('EAB-20261021-000001'));
  const pages = layoutDocument(doc, (t, f) => t.length * f.size * 0.5);
  assert.ok(pages.length >= 1);
  const sheets = buildProfileSheets(input);
  assert.deepEqual(sheets.map(s => s.name), ['Agent', 'Listings', 'Contacts', 'Change history']);
  const listing = sheets[1];
  assert.deepEqual(listing.rows[0].slice(0, 4), ['Record ID', 'Deleted', 'Version', 'Last saved']);
  assert.equal(listing.rows[2][1], 'Yes');
  assert.ok(sheets[3].rows.some(r => r[5] === 'Deleted' && r[6] === 'No' && r[7] === 'Yes'));
  assert.equal(exportFileName('EAB-1', 'Ali.Bin@x.com', 'xlsx'), 'EAB-1-Ali-Bin.xlsx');
});

test('AdminBatch002: export shows account status with reason, licence, Terms, and adds sign-in and Terms sheets', () => {
  const p = { ...profile, status: 'suspended' as const, status_reason: 'Misleading listing', licence: 'REN 31234 (verified)',
    terms: { version: '1.1-draft', at: '2026-10-19T02:00:00Z' }, marketing: true,
    last_login: { at: '2026-10-20T06:00:00Z', platform: 'android', app_version: '2.2.0' } };
  const loginLog = [
    { seq: 2, happened_at: '2026-10-20T06:00:00Z', received_at: '', event: 'sign_in', device_id: null, device: null, platform: 'android', app_version: '2.2.0', lat: 3.15791, lng: 101.71162, acc: 5, detail: null },
    { seq: 1, happened_at: '2026-10-20T05:00:00Z', received_at: '', event: 'locked_out', device_id: null, device: null, platform: 'android', app_version: null, lat: null, lng: null, acc: null, detail: null },
  ];
  const termsLog = [{ seq: 1, at: '2026-10-19T02:00:00Z', kind: 'terms' as const, terms_version: '1.1-draft', accepted: true, device_id: null }];
  const input = { reference: 'EAB-1', createdAt: '2026-10-20T18:00:00Z', adminEmail: 'joe@example.com', companyName: 'JSL Global Trading',
    profile: p, records: {}, loginLog, termsLog };
  const doc = buildProfileDoc(input);
  const t = JSON.stringify(doc.blocks);
  assert.ok(t.includes('Suspended — Misleading listing'));
  assert.ok(t.includes('REN 31234 (verified)'));
  assert.ok(t.includes('Version 1.1-draft on 2026-10-19 10:00 MYT'));
  assert.ok(t.includes('JSL Global Trading · Reference EAB-1'));
  assert.ok(t.includes('2026-10-20 14:00 MYT · Signed in · android · v2.2.0 · 3.1579, 101.7116'));
  assert.ok(t.includes('Locked out (30 tries)'));
  const sheets = buildProfileSheets(input);
  assert.deepEqual(sheets.map(s => s.name), ['Agent', 'Sign-in history', 'Terms and consent']);
  assert.deepEqual(sheets[1].rows[2].slice(0, 2), ['2026-10-20 13:00 MYT', 'Locked out (30 tries)']);
  assert.equal(sheets[1].rows[1][5], 3.15791, 'coordinates stay numbers in Excel');
});
