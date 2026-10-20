// Regulator Request packs (feature 72) and the Document Vault (19).
// A pack is one PDF or Excel file for a case: a cover page (the request, the agents, the reference number and the
// content fingerprint) followed by each agent's complete compliance record (the same content as an Agent Profile
// export). After the file is made:
//   1. its sha256 (file fingerprint) and the sha256 of the data inside it (content fingerprint) are registered;
//   2. the file is uploaded to the private vault (accepted only for that registered fingerprint, once);
//   3. a copy is saved on this device.
// "Check a file" later recomputes a file's fingerprint and looks it up, proving a copy is unchanged.
import { Api, AgentProfile, AgentRecord, CaseAgent, CaseFile, LoginRow, Pack, Version } from '../api/admin';
import { sha256Hex } from '../api/session';
import { Block, Doc, layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf, saveFile, download } from '../lib/pdfRender';
import { isNative } from '../native/native';
import { ExportInput, buildProfileDoc, buildProfileSheets, fmtTime, sortCollections } from './reports';
import { Cell, Sheet, buildXlsx, XLSX_MIME } from './xlsx';
import { allRecords } from './run';

export const REQUESTER_LABEL: Record<string, string> = {
  jpph: 'Jabatan Penilaian dan Perkhidmatan Harta (JPPH)', police: 'Polis Diraja Malaysia (police)', court: 'Court',
  board: 'Board of Valuers, Appraisers, Estate Agents and Property Managers (LPPEH)', pdpa: "Agent's own request (PDPA access)", other: 'Other',
};

/** JSON with sorted keys, so the same data always gives the same content fingerprint. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
export const contentFingerprint = async (data: unknown) => sha256Hex(new TextEncoder().encode(stableStringify(data)));
export const shortFp = (h: string | null | undefined) => (h ? `${h.slice(0, 8)}…${h.slice(-8)}` : '');

/** Keeps only sign-ins inside an agent's date range on the case (records are always complete: their current state). */
export function inRange(rows: LoginRow[], from: string | null, to: string | null): LoginRow[] {
  const f = from ? Date.parse(`${from}T00:00:00+08:00`) : -Infinity;
  const t = to ? Date.parse(`${to}T23:59:59.999+08:00`) : Infinity;
  return rows.filter(r => { const x = Date.parse(r.happened_at); return x >= f && x <= t; });
}

export interface AgentBundle {
  agent: CaseAgent; profile: AgentProfile; records: Record<string, AgentRecord[]>; histories: Record<string, Version[]>;
  loginLog: LoginRow[]; termsLog: ExportInput['termsLog'];
}

export function caseCoverBlocks(c: CaseFile, agents: CaseAgent[], reference: string, createdAt: string, adminEmail: string, contentSha: string, companyName?: string): Block[] {
  return [
    { t: 'title', text: 'Regulator request pack', sub: `${companyName ? `${companyName} · ` : ''}${c.case_no} · Reference ${reference}` },
    { t: 'rows', rows: [
      { k: 'Case', v: c.case_no, strong: true },
      { k: 'Requested by', v: REQUESTER_LABEL[c.requester_type] ?? c.requester_type },
      { k: 'Officer / office', v: c.requester_name },
      { k: 'Their reference', v: c.requester_ref ?? '' },
      { k: 'Received', v: c.received_on },
      { k: 'Deadline', v: c.deadline ?? '' },
      { k: 'Request', v: c.description },
    ] },
    { t: 'heading', text: `Agents in this pack (${agents.length})` },
    { t: 'rows', rows: agents.map(a => ({ k: a.name || a.email, v: `${a.email} · period ${a.date_from ?? 'start'} to ${a.date_to ?? 'today'}` })) },
    { t: 'heading', text: 'Proof of contents' },
    { t: 'rows', rows: [
      { k: 'Pack reference', v: reference, strong: true },
      { k: 'Prepared', v: `${fmtTime(createdAt)} by ${adminEmail}` },
      { k: 'Content fingerprint (SHA-256)', v: contentSha },
    ] },
    { t: 'text', small: true, muted: true, text: 'The content fingerprint is computed from all the data in this pack. The file itself is also fingerprinted and kept in the Admin EAB Document Vault; the company can prove any copy of this file is unchanged by checking it there. Records show their current state with full change history; sign-in history is limited to each agent’s period above. Times are Malaysia time (MYT).' },
    { t: 'rule' },
  ];
}

export function buildCasePackDoc(c: CaseFile, bundles: AgentBundle[], ref: string, createdAt: string, adminEmail: string, contentSha: string, companyName?: string): Doc {
  const blocks: Block[] = caseCoverBlocks(c, bundles.map(b => b.agent), ref, createdAt, adminEmail, contentSha, companyName);
  bundles.forEach((b, i) => {
    const d = buildProfileDoc({ reference: ref, createdAt, adminEmail, companyName, profile: b.profile, records: b.records, histories: b.histories, loginLog: b.loginLog, termsLog: b.termsLog });
    blocks.push({ t: 'space', h: 10 });
    blocks.push({ t: 'heading', text: `Agent ${i + 1} of ${bundles.length}: ${b.profile.name || b.profile.email}` });
    blocks.push(...d.blocks.slice(1));   // drop the per-agent title; keep everything else
  });
  return { blocks, footer: `Admin EAB · ${c.case_no} · ${ref} · content ${shortFp(contentSha)}` };
}

export function buildCasePackSheets(c: CaseFile, bundles: AgentBundle[], ref: string, createdAt: string, adminEmail: string, contentSha: string, companyName?: string): Sheet[] {
  const cover: Sheet = { name: 'Case', widths: [30, 80], rows: [
    ['Field', 'Value'],
    ['Case', c.case_no], ['Requested by', REQUESTER_LABEL[c.requester_type] ?? c.requester_type], ['Officer / office', c.requester_name],
    ['Their reference', c.requester_ref ?? ''], ['Received', c.received_on], ['Deadline', c.deadline ?? ''], ['Request', c.description],
    ['Pack reference', ref], ['Prepared', `${fmtTime(createdAt)} by ${adminEmail}`], ['Company', companyName ?? ''],
    ['Content fingerprint (SHA-256)', contentSha],
    ...bundles.map((b, i) => [`Agent ${i + 1}`, `${b.profile.name ?? ''} ${b.profile.email} · period ${b.agent.date_from ?? 'start'} to ${b.agent.date_to ?? 'today'}`] as Cell[]),
  ] };
  const sheets: Sheet[] = [cover];
  bundles.forEach((b, i) => {
    const per = buildProfileSheets({ reference: ref, createdAt, adminEmail, companyName, profile: b.profile, records: b.records, histories: b.histories, loginLog: b.loginLog, termsLog: b.termsLog });
    for (const s of per) sheets.push(bundles.length > 1 ? { ...s, name: `A${i + 1} ${s.name}` } : s);
  });
  return sheets;
}

async function gather(api: Api, a: CaseAgent): Promise<AgentBundle> {
  const profile = await api.agent(a.user_id);
  const records: Record<string, AgentRecord[]> = {};
  for (const c of sortCollections(Object.keys(profile.counts))) records[c] = await allRecords(api, a.user_id, c);
  const histories: Record<string, Version[]> = {};
  for (const r of Object.values(records).flat().filter(x => x.rev > 1)) histories[`${r.collection}/${r.id}`] = await api.history(r.workspace_id, r.collection, r.id);
  const [loginAll, termsLog] = await Promise.all([api.loginLog(a.user_id, 1000), api.termsLog(a.user_id)]);
  return { agent: a, profile, records, histories, loginLog: inRange(loginAll, a.date_from, a.date_to), termsLog };
}

/** Puts a finished file in the vault: register (with both fingerprints) → upload → mark stored. Returns the pack. */
export async function storeInVault(api: Api, f: { blob: Blob; reference: string; kind: Pack['kind']; format: 'pdf' | 'xlsx'; fileName: string;
  caseId: string | null; agentUser: string | null; contentSha: string | null }): Promise<Pack> {
  const sha = await sha256Hex(f.blob);
  const pack = await api.packRegister({ case_id: f.caseId, agent_user: f.agentUser, reference: f.reference, kind: f.kind, format: f.format,
    file_name: f.fileName, sha256: sha, content_sha256: f.contentSha, bytes: f.blob.size });
  await api.files.upload(`${pack.id}/${sha}`, f.blob);
  return api.packStored(pack.id);
}

export async function saveLocally(blob: Blob, name: string): Promise<string> {
  if (isNative()) {
    const r = await saveFile(blob, name);
    if (!r.ok) throw new Error(r.reason === 'needApk' ? 'This app version cannot save files. Install the newest APK.' : 'Could not save the file.');
    return `saved ${name}${r.where ? ` to ${r.where}` : ''}`;
  }
  if (!download(blob, name)) throw new Error('The browser blocked the download.');
  return `downloaded ${name}`;
}

export const packFileName = (c: CaseFile, reference: string, ext: 'pdf' | 'xlsx') => `${c.case_no}-${reference}.${ext}`;

/** Builds, vaults and saves a case pack. */
export async function buildCasePack(api: Api, adminEmail: string, c: CaseFile, format: 'pdf' | 'xlsx',
  onStep: (s: string) => void = () => {}): Promise<{ pack: Pack; how: string }> {
  const agents = (Array.isArray(c.agents) ? c.agents : []).filter(a => !a.removed_at);
  if (!agents.length) throw new Error('Add at least one agent to the case first.');
  const bundles: AgentBundle[] = [];
  for (const [i, a] of agents.entries()) { onStep(`Collecting agent ${i + 1} of ${agents.length}…`); bundles.push(await gather(api, a)); }
  const companyName = await api.settings().then(s => s.company_name).catch(() => undefined);
  const contentSha = await contentFingerprint({ case: { case_no: c.case_no, requester_type: c.requester_type, requester_name: c.requester_name,
    requester_ref: c.requester_ref, received_on: c.received_on, description: c.description }, agents: bundles.map(b => ({ agent: b.agent, profile: b.profile,
    records: b.records, histories: b.histories, loginLog: b.loginLog, termsLog: b.termsLog })) });
  onStep('Registering the export…');
  const kind: Pack['kind'] = c.requester_type === 'pdpa' ? 'pdpa_access' : 'case_pack';
  const reg = await api.startExport(kind, format, agents.length === 1 ? agents[0].user_id : null,
    { case: c.case_no, agents: agents.length, content_sha256: contentSha });
  onStep(format === 'pdf' ? 'Making the PDF…' : 'Making the Excel file…');
  const blob = format === 'pdf'
    ? await renderPagesToPdf(layoutDocument(buildCasePackDoc(c, bundles, reg.reference, reg.at, adminEmail, contentSha, companyName), canvasMeasure()), `${c.case_no} ${reg.reference}`)
    : new Blob([buildXlsx(buildCasePackSheets(c, bundles, reg.reference, reg.at, adminEmail, contentSha, companyName), { title: `${c.case_no} ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  const name = packFileName(c, reg.reference, format);
  onStep('Storing in the Document Vault…');
  const pack = await storeInVault(api, { blob, reference: reg.reference, kind, format, fileName: name, caseId: c.id,
    agentUser: agents.length === 1 ? agents[0].user_id : null, contentSha });
  onStep('Saving a copy…');
  return { pack, how: await saveLocally(blob, name) };
}

/** Downloads a vault file and checks it still has its recorded fingerprint before saving it. */
export async function downloadPack(api: Api, p: Pack): Promise<string> {
  const info = await api.packDownload(p.id);
  const blob = await api.files.download(info.path);
  const sha = await sha256Hex(blob);
  if (sha !== info.sha256) throw new Error('WARNING: the stored file does not match its fingerprint. Do not use it; tell the Owner.');
  return saveLocally(blob, info.file_name);
}
