// AdminBatch004 — System Health report (PDF / Excel) for auditors: storage, backups and every recorded backup test,
// database health. Counts and sizes only — no agent's personal data. Pure builders, so they are unit-tested.
import { Block, Doc, layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf } from '../lib/pdfRender';
import { Api, BackupTest, DbHealth, StorageHealth } from '../api/admin';
import { Sheet } from './xlsx';
import { buildXlsx, XLSX_MIME } from './xlsx';
import { fmtTime } from './reports';
import { saveLocally } from './pack';
import { cumulativeFromUploads, fmtBytes, fmtPct, forecast, MB, Point } from '../admin/health';

export const TARGET_LABEL: Record<BackupTest['target'], string> = { supabase: 'Supabase', aws: 'AWS', other: 'Other' };
export const KIND_LABEL: Record<BackupTest['kind'], string> = { restore_test: 'Restore test', backup_check: 'Backup check' };
export const RESULT_LABEL: Record<BackupTest['result'], string> = { pass: 'Passed', partial: 'Partly passed', fail: 'Failed' };

export interface HealthReportInput {
  reference: string; createdAt: string; adminEmail: string; companyName?: string; today: string;
  db: DbHealth; storage: StorageHealth; tests: BackupTest[];
}

export function storageForecasts(s: StorageHealth, today: string) {
  const dbPoints: Point[] = s.daily.map(d => ({ day: d.day, bytes: d.db_bytes }));
  const filePoints = cumulativeFromUploads(s.uploads, s.today.storage_bytes, today);
  return {
    db: forecast(s.today.db_bytes, s.limits.db_limit_mb * MB, dbPoints, today),
    files: forecast(s.today.storage_bytes, s.limits.storage_limit_mb * MB, filePoints, today),
  };
}

export function buildHealthDoc(x: HealthReportInput): Doc {
  const f = storageForecasts(x.storage, x.today);
  const b: Block[] = [
    { t: 'title', text: 'System Health report', sub: `${x.companyName ?? ''}${x.companyName ? ' · ' : ''}Estate Agent AI Buddy` },
    { t: 'rows', rows: [
      { k: 'Reference', v: x.reference, strong: true },
      { k: 'Made', v: `${fmtTime(x.createdAt)} by ${x.adminEmail}` },
      { k: 'Contains', v: 'Sizes, counts and backup records only. No agent personal data.' },
    ] },
    { t: 'heading', text: 'Storage' },
    { t: 'rows', rows: [
      { k: 'Database', v: `${fmtBytes(f.db.used)} of ${fmtBytes(f.db.limit)} (${fmtPct(f.db.usedPct)})`, warn: f.db.level !== 'ok' },
      { k: 'Database forecast', v: f.db.sentence },
      { k: 'Stored files', v: `${fmtBytes(f.files.used)} of ${fmtBytes(f.files.limit)} (${fmtPct(f.files.usedPct)}) · ${x.storage.today.storage_files} files`, warn: f.files.level !== 'ok' },
      { k: 'Files forecast', v: f.files.sentence },
      ...x.storage.buckets.map(bk => ({ k: `  ${bk.bucket}`, v: `${fmtBytes(bk.bytes)} · ${bk.files} files`, sub: true })),
    ] },
    { t: 'heading', text: 'Backups' },
    { t: 'rows', rows: [
      { k: 'Supabase', v: 'Backups are made by Supabase according to the plan. Proof that they restore is the test log below.' },
      { k: 'AWS', v: x.storage.limits.aws_backup === 'set_up' ? `Set up${x.storage.limits.aws_note ? ` — ${x.storage.limits.aws_note}` : ''}` : 'Not set up yet', warn: x.storage.limits.aws_backup !== 'set_up' },
      { k: 'Last restore test passed', v: x.storage.backup_tests.last_restore_pass ? `${x.storage.backup_tests.last_restore_pass.tested_on} (${x.storage.backup_tests.last_restore_pass.ref})` : 'None recorded', warn: !x.storage.backup_tests.last_restore_pass },
      { k: 'Recorded checks and tests', v: String(x.tests.length) },
    ] },
  ];
  if (x.tests.length) {
    b.push({ t: 'heading', text: 'Backup check and restore test log' });
    for (const t of x.tests) b.push({ t: 'rows', rows: [
      { k: t.ref, v: `${t.tested_on} · ${TARGET_LABEL[t.target]} · ${KIND_LABEL[t.kind]} · ${RESULT_LABEL[t.result]}`, strong: true, warn: t.result !== 'pass' },
      { k: 'What', v: t.what, sub: true },
      ...(t.duration_minutes != null ? [{ k: 'Took', v: `${t.duration_minutes} minutes`, sub: true }] : []),
      ...(t.notes ? [{ k: 'Notes', v: t.notes, sub: true }] : []),
      { k: 'Recorded', v: `${fmtTime(t.recorded_at)} by ${t.recorded_by_email ?? t.recorded_by}`, sub: true },
    ] });
  }
  const c = x.db.connections, st = x.db.stats;
  b.push({ t: 'heading', text: 'Database health' },
    { t: 'rows', rows: [
      { k: 'Checked', v: fmtTime(x.db.checked_at) },
      { k: 'Postgres', v: x.db.postgres },
      { k: 'Connections', v: `${c.total} of ${c.max} (${c.active} working, ${c.idle} idle)`, warn: c.total / c.max > 0.8 },
      { k: 'Cache hit rate', v: fmtPct(st?.cache_hit_pct ?? null, 2), warn: (st?.cache_hit_pct ?? 100) < 95 },
      { k: 'Slow queries now', v: `${x.db.slow_queries} (longest ${x.db.longest_query_s} s)`, warn: x.db.slow_queries > 0 },
      { k: 'Deadlocks', v: String(st?.deadlocks ?? 0), warn: (st?.deadlocks ?? 0) > 0 },
    ] },
    { t: 'heading', text: 'Largest tables' },
    { t: 'rows', rows: x.db.tables.slice(0, 25).map(t => ({ k: t.name, v: `${fmtBytes(t.total_bytes)} · ${t.rows.toLocaleString()} rows${t.dead_rows ? ` · ${t.dead_rows} dead` : ''}` })) });
  return { blocks: b, footer: `${x.reference} · System Health report · ${fmtTime(x.createdAt)}` };
}

export function buildHealthSheets(x: HealthReportInput): Sheet[] {
  const f = storageForecasts(x.storage, x.today);
  return [
    { name: 'Summary', widths: [30, 70], rows: [
      ['System Health report', x.reference], ['Made', `${fmtTime(x.createdAt)} by ${x.adminEmail}`], ['Company', x.companyName ?? ''],
      [], ['Database used (bytes)', f.db.used], ['Database limit (bytes)', f.db.limit], ['Database forecast', f.db.sentence],
      ['Stored files used (bytes)', f.files.used], ['Stored files limit (bytes)', f.files.limit], ['Stored files count', x.storage.today.storage_files],
      ['Files forecast', f.files.sentence], ['AWS backup', x.storage.limits.aws_backup === 'set_up' ? `Set up ${x.storage.limits.aws_note ?? ''}`.trim() : 'Not set up'],
      ['Last restore test passed', x.storage.backup_tests.last_restore_pass?.tested_on ?? 'None recorded'],
      ['Connections', `${x.db.connections.total} of ${x.db.connections.max}`], ['Cache hit %', x.db.stats?.cache_hit_pct ?? ''],
      ['Deadlocks', x.db.stats?.deadlocks ?? 0], ['Postgres', x.db.postgres],
    ] },
    { name: 'Backup tests', widths: [14, 12, 10, 14, 12, 60, 10, 40, 22, 28], rows: [
      ['Reference', 'Date', 'Where', 'What kind', 'Result', 'What was checked or restored', 'Minutes', 'Notes', 'Recorded at', 'Recorded by'],
      ...x.tests.map(t => [t.ref, t.tested_on, TARGET_LABEL[t.target], KIND_LABEL[t.kind], RESULT_LABEL[t.result], t.what, t.duration_minutes ?? '', t.notes ?? '', fmtTime(t.recorded_at), t.recorded_by_email ?? t.recorded_by]),
    ] },
    { name: 'Storage by day', widths: [12, 16, 16, 12], rows: [
      ['Day', 'Database bytes', 'Stored file bytes', 'Files'],
      ...x.storage.daily.map(d => [d.day, d.db_bytes, d.storage_bytes, d.storage_files]),
    ] },
    { name: 'Buckets', widths: [20, 10, 16, 22, 22], rows: [
      ['Bucket', 'Files', 'Bytes', 'First file', 'Last file'],
      ...x.storage.buckets.map(b => [b.bucket, b.files, b.bytes, fmtTime(b.first_at), fmtTime(b.last_at)]),
    ] },
    { name: 'Tables', widths: [30, 14, 14, 12, 10, 22, 22], rows: [
      ['Table', 'Total bytes', 'Data bytes', 'Rows', 'Dead rows', 'Last vacuum', 'Last analyse'],
      ...x.db.tables.map(t => [t.name, t.total_bytes, t.data_bytes, t.rows, t.dead_rows, fmtTime(t.last_vacuum), fmtTime(t.last_analyze)]),
    ] },
  ];
}

export const healthFileName = (reference: string, ext: 'pdf' | 'xlsx') => `System-Health-${reference}.${ext}`;

/** Registers the export (reference number + access-log entry), makes the file and saves it on this device. */
export async function exportHealthReport(api: Api, adminEmail: string, format: 'pdf' | 'xlsx', today: string): Promise<{ reference: string; how: string }> {
  const [db, storage, tests, companyName] = await Promise.all([
    api.healthDb(), api.healthStorage(), api.backupTests(1000), api.settings().then(s => s.company_name).catch(() => undefined),
  ]);
  const reg = await api.startExport('health_report', format, null, { backup_tests: tests.length });
  const input: HealthReportInput = { reference: reg.reference, createdAt: reg.at, adminEmail, companyName, today, db, storage, tests };
  const name = healthFileName(reg.reference, format);
  const blob = format === 'pdf'
    ? await renderPagesToPdf(layoutDocument(buildHealthDoc(input), canvasMeasure()), `System Health ${reg.reference}`)
    : new Blob([buildXlsx(buildHealthSheets(input), { title: `System Health ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  return { reference: reg.reference, how: await saveLocally(blob, name) };
}
