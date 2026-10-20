// Runs an Agent Profile export: gathers every record (and, if asked, every version), registers the export with the
// database (which returns the reference number and writes the access-log entry), then makes and saves the file.
import { Api, AgentProfile, AgentRecord, Version } from '../api/admin';
import { buildProfileDoc, buildProfileSheets, exportFileName, sortCollections } from './reports';
import { buildXlsx, XLSX_MIME } from './xlsx';
import { layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf } from '../lib/pdfRender';
import { contentFingerprint, saveLocally, storeInVault } from './pack';

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
  const [loginLog, termsLog, companyName] = await Promise.all([
    api.loginLog(profile.user_id, 1000),
    api.termsLog(profile.user_id),
    api.settings().then(s => s.company_name).catch(() => undefined),   // shown on the export; never hard-coded
  ]);
  const total = Object.values(records).reduce((n, l) => n + l.length, 0);
  const reg = await api.startExport('agent_profile', format, profile.user_id, { records: total, with_history: opts.withHistory, sign_ins: loginLog.length });
  const input = { reference: reg.reference, createdAt: reg.at, adminEmail, companyName, profile, records, histories, loginLog, termsLog };
  const name = exportFileName(reg.reference, profile.email, format);
  let blob: Blob;
  if (format === 'pdf') {
    const pages = layoutDocument(buildProfileDoc(input), canvasMeasure());
    blob = await renderPagesToPdf(pages, `Agent compliance record ${reg.reference}`);
  } else {
    blob = new Blob([buildXlsx(buildProfileSheets(input), { title: `Agent compliance record ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  }
  // AdminBatch003: every export is also kept in the Document Vault with its fingerprints. If the vault is not
  // available, the copy is still saved on this device and the message says so.
  let vaulted = '';
  try {
    const contentSha = await contentFingerprint({ profile, records, histories, loginLog, termsLog });
    await storeInVault(api, { blob, reference: reg.reference, kind: 'agent_profile', format, fileName: name, caseId: null, agentUser: profile.user_id, contentSha });
    vaulted = ' · kept in the Document Vault';
  } catch {
    vaulted = ' · NOT stored in the Document Vault (try again or tell the Owner)';
  }
  return { reference: reg.reference, how: `${await saveLocally(blob, name)}${vaulted}` };
}
