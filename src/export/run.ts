// Runs an Agent Profile export: gathers every record (and, if asked, every version), registers the export with the
// database (which returns the reference number and writes the access-log entry), then makes and saves the file.
import { Api, AgentProfile, AgentRecord, Version } from '../api/admin';
import { buildProfileDoc, buildProfileSheets, exportFileName, sortCollections } from './reports';
import { buildXlsx, XLSX_MIME } from './xlsx';
import { layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf, saveFile, download } from '../lib/pdfRender';
import { isNative } from '../native/native';

const PAGE = 1000;

export async function allRecords(api: Api, agent: string, collection: string): Promise<AgentRecord[]> {
  const out: AgentRecord[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await api.records(agent, collection, true, PAGE, offset);
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** Runs tasks a few at a time (so a big export does not flood the database). */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export async function exportAgentProfile(api: Api, adminEmail: string, profile: AgentProfile, format: 'pdf' | 'xlsx',
  opts: { withHistory: boolean }): Promise<{ reference: string; how: string }> {
  const records: Record<string, AgentRecord[]> = {};
  for (const c of sortCollections(Object.keys(profile.counts))) records[c] = await allRecords(api, profile.user_id, c);
  const histories: Record<string, Version[]> = {};
  if (opts.withHistory) {
    const changed = Object.values(records).flat().filter(r => r.rev > 1);
    await pool(changed, 4, async r => { histories[`${r.collection}/${r.id}`] = await api.history(r.workspace_id, r.collection, r.id); });
  }
  const total = Object.values(records).reduce((n, l) => n + l.length, 0);
  const reg = await api.startExport('agent_profile', format, profile.user_id, { records: total, with_history: opts.withHistory });
  const input = { reference: reg.reference, createdAt: reg.at, adminEmail, profile, records, histories };
  const name = exportFileName(reg.reference, profile.email, format);
  let blob: Blob;
  if (format === 'pdf') {
    const pages = layoutDocument(buildProfileDoc(input), canvasMeasure());
    blob = await renderPagesToPdf(pages, `Agent compliance record ${reg.reference}`);
  } else {
    blob = new Blob([buildXlsx(buildProfileSheets(input), { title: `Agent compliance record ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  }
  if (isNative()) {
    const r = await saveFile(blob, name);
    if (!r.ok) throw new Error(r.reason === 'needApk' ? 'This app version cannot save files. Install the newest APK.' : 'Could not save the file.');
    return { reference: reg.reference, how: `saved ${name}${r.where ? ` to ${r.where}` : ''}` };
  }
  if (!download(blob, name)) throw new Error('The browser blocked the download.');
  return { reference: reg.reference, how: `downloaded ${name}` };
}
