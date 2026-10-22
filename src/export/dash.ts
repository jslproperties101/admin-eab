// AdminBatch005 — Dashboards report (PDF / Excel) for the chosen period: growth, active users, retention and at-risk
// agents, inactive agents, versions / phones / language, listings and the deal pipeline, feature usage.
// Owner and Compliance only (the database refuses anyone else). Saved on this device, not in the Document Vault.
// Pure builders, so they are unit-tested.
import { Block, Doc, layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf } from '../lib/pdfRender';
import { Api, DashActive, DashDevices, DashGrowth, DashInactive, DashListings, DashRetention, DashUsage } from '../api/admin';
import { Sheet, buildXlsx, XLSX_MIME } from './xlsx';
import { fmtTime } from './reports';
import { saveLocally } from './pack';
import {
  AT_RISK_REASON, BUCKET_LABEL, PIPELINE_LABEL, PURPOSE_LABEL, bucketFor, bucketLabel, cmpVersionDesc, fmtNum, fmtPct0, kindLabel,
  languageLabel, nameLabel, rangeDays, sortStatuses,
} from '../admin/dash';
import { platformLabel } from '../screens/status';

export interface DashData {
  growth: DashGrowth; active: DashActive; retention: DashRetention; inactive: DashInactive;
  devices: DashDevices; listings: DashListings; usage: DashUsage;
}
export interface DashReportInput { reference: string; createdAt: string; adminEmail: string; companyName?: string; from: string; to: string; data: DashData }

const who = (email: string | null, name: string | null) => (name ? `${name} (${email ?? '—'})` : email ?? '—');

export function buildDashDoc(x: DashReportInput): Doc {
  const { growth: g, active: a, retention: r, inactive: i, devices: d, listings: l, usage: u } = x.data;
  const b: Block[] = [
    { t: 'title', text: 'Dashboards report', sub: `${x.companyName ?? ''}${x.companyName ? ' · ' : ''}Estate Agent AI Buddy` },
    { t: 'rows', rows: [
      { k: 'Reference', v: x.reference, strong: true },
      { k: 'Period', v: `${x.from} to ${x.to} (${rangeDays(x)} days, Malaysia dates)` },
      { k: 'Made', v: `${fmtTime(x.createdAt)} by ${x.adminEmail}` },
      { k: 'Contains', v: 'Totals for the period, plus lists of named agents (inactive, at risk) and stale listings.' },
    ] },
    { t: 'heading', text: 'Sign-ups & growth' },
    { t: 'rows', rows: [
      { k: 'Agents at end of period', v: fmtNum(g.total), strong: true },
      { k: 'New in the period', v: fmtNum(g.new) },
      { k: 'Before the period', v: fmtNum(g.before) },
      ...g.buckets.filter(k => k.new).map(k => ({ k: `  ${bucketLabel(k.start, g.bucket)}`, v: `${k.new} new · ${k.running} total`, sub: true })),
    ] },
    { t: 'heading', text: 'Active users' },
    { t: 'rows', rows: [
      { k: 'Used the app in the period', v: `${fmtNum(a.active_in_range)} of ${fmtNum(a.agents)} agents` },
      { k: 'Average daily active', v: fmtNum(a.avg_dau, 1) },
      { k: 'Average weekly active', v: fmtNum(a.avg_wau, 1) },
      { k: 'Average monthly active', v: fmtNum(a.avg_mau, 1) },
      { k: 'Stickiness (daily ÷ monthly)', v: fmtPct0(a.stickiness_pct) },
    ] },
    { t: 'heading', text: 'Retention & churn' },
    { t: 'rows', rows: [
      { k: 'Joined in the period', v: fmtNum(r.joined) },
      ...r.retention.map(k => ({ k: `Still using after ${k.days} days`, v: k.eligible ? `${k.kept} of ${k.eligible} (${fmtPct0(k.pct)})` : 'Not enough time yet' })),
      { k: 'At-risk agents', v: fmtNum(r.at_risk.count), warn: r.at_risk.count > 0 },
      ...(r.at_risk.agents ?? []).map(k => ({ k: `  ${who(k.email, k.name)}`, v: `last used ${k.last_day} (${k.days_since} days) · ${AT_RISK_REASON[k.reason] ?? k.reason}`, sub: true })),
    ] },
    { t: 'heading', text: 'Inactive agents' },
    { t: 'rows', rows: [
      { k: 'No activity 30+ days', v: fmtNum(i.counts['30']) },
      { k: 'No activity 60+ days', v: fmtNum(i.counts['60']) },
      { k: 'No activity 90+ days', v: fmtNum(i.counts['90']) },
      { k: 'Never opened the app', v: fmtNum(i.never_opened) },
      ...(i.list ?? []).map(k => ({ k: `  ${who(k.email, k.name)}`, v: `last seen ${k.last_seen ?? 'never'} · ${k.days_since} days · ${k.app_version ?? '—'}`, sub: true })),
    ] },
    { t: 'heading', text: 'App versions, phones and language' },
    { t: 'rows', rows: [
      { k: 'Agents seen in the period', v: fmtNum(d.agents) },
      ...[...d.versions].sort((p, q) => cmpVersionDesc(p.app_version, q.app_version)).map(v => ({ k: `Version ${v.app_version}`, v: `${v.agents} agents` })),
      ...d.platforms.map(p => ({ k: platformLabel(p.platform), v: `${p.agents} agents` })),
      ...d.devices.slice(0, 15).map(p => ({ k: `  ${p.device}`, v: `${p.agents} · ${platformLabel(p.platform)}`, sub: true })),
      ...d.languages.map(p => ({ k: `Language: ${languageLabel(p.language)}`, v: `${p.agents} agents` })),
    ] },
    { t: 'heading', text: 'Listings' },
    { t: 'rows', rows: [
      { k: 'Listings (not deleted)', v: fmtNum(l.total), strong: true },
      { k: 'Deleted (kept for audit)', v: fmtNum(l.deleted) },
      { k: 'Agents with listings', v: fmtNum(l.agents_with_listings) },
      ...sortStatuses(l.by_status).map(s => ({ k: s.label, v: fmtNum(s.n) })),
      ...Object.entries(l.by_purpose).map(([k, n]) => ({ k: PURPOSE_LABEL[k] ?? k, v: fmtNum(n), sub: true })),
      { k: `Stale (Available, no change for ${l.stale_days} days)`, v: fmtNum(l.stale_count), warn: l.stale_count > 0 },
      ...(l.stale ?? []).map(s => ({ k: `  ${s.ref ?? s.id}`, v: `${s.headline ?? s.type ?? ''} · ${who(s.email, s.name)} · ${s.days} days`, sub: true })),
    ] },
    { t: 'heading', text: 'Deal pipeline' },
    { t: 'rows', rows: [
      { k: 'Sale', v: l.pipeline.sale.map(s => `${PIPELINE_LABEL[s.stage] ?? s.stage} ${s.listings}`).join(' > ') },
      { k: 'Rent', v: l.pipeline.rent.map(s => `${PIPELINE_LABEL[s.stage] ?? s.stage} ${s.listings}`).join(' > ') },
    ] },
    { t: 'heading', text: 'Feature usage (top 30)' },
    { t: 'rows', rows: u.ranking.filter(k => k.kind === 'screen' || k.kind === 'feature').slice(0, 30)
      .map(k => ({ k: `${kindLabel(k.kind)}: ${nameLabel(k.name)}`, v: `${fmtNum(k.events)} times · ${k.agents} agents` })) },
  ];
  if (u.not_used.length) b.push({ t: 'text', text: `Not used in the period: ${u.not_used.map(k => nameLabel(k.name)).join(', ')}.`, small: true });
  b.push({ t: 'text', text: 'Generated by Admin EAB from the live database. This export is recorded in the tamper-proof access log under the reference above.', small: true, muted: true });
  return { blocks: b, footer: `${x.reference} · Dashboards ${x.from} to ${x.to} · ${fmtTime(x.createdAt)}` };
}

export function buildDashSheets(x: DashReportInput): Sheet[] {
  const { growth: g, active: a, retention: r, inactive: i, devices: d, listings: l, usage: u } = x.data;
  return [
    { name: 'Summary', widths: [36, 60], rows: [
      ['Dashboards report', x.reference], ['Period', `${x.from} to ${x.to}`], ['Made', `${fmtTime(x.createdAt)} by ${x.adminEmail}`], ['Company', x.companyName ?? ''],
      [], ['Agents at end of period', g.total], ['New agents in period', g.new], ['Used the app in period', a.active_in_range],
      ['Average daily active', a.avg_dau ?? ''], ['Average weekly active', a.avg_wau ?? ''], ['Average monthly active', a.avg_mau ?? ''],
      ['Stickiness %', a.stickiness_pct ?? ''], ['At-risk agents', r.at_risk.count],
      ['Inactive 30+ days', i.counts['30']], ['Inactive 60+ days', i.counts['60']], ['Inactive 90+ days', i.counts['90']], ['Never opened the app', i.never_opened],
      ['Listings', l.total], ['Deleted listings', l.deleted], [`Stale listings (${l.stale_days} days)`, l.stale_count],
    ] },
    { name: 'Growth', widths: [14, 10, 12], rows: [[`Start (${BUCKET_LABEL[g.bucket]})`, 'New', 'Running total'], ...g.buckets.map(k => [k.start, k.new, k.running])] },
    { name: 'Active by day', widths: [12, 10, 10, 10], rows: [['Day', 'Daily active', 'Weekly active', 'Monthly active'], ...a.by_day.map(k => [k.day, k.dau, k.wau, k.mau])] },
    { name: 'Retention', widths: [12, 10, 10, 10, 10, 10, 10, 10], rows: [
      ['Joined month', 'Joined', 'Kept 7d', 'Of', 'Kept 30d', 'Of', 'Kept 90d', 'Of'],
      ...r.cohorts.map(c => [c.month.slice(0, 7), c.joined, c.kept7, c.eligible7, c.kept30, c.eligible30, c.kept90, c.eligible90]),
    ] },
    { name: 'At risk', widths: [36, 28, 12, 10, 12, 12, 30], rows: [
      ['Email', 'Name', 'Last used', 'Days', 'Days used (last 30)', 'Days used (30 before)', 'Why'],
      ...(r.at_risk.agents ?? []).map(k => [k.email, k.name ?? '', k.last_day, k.days_since, k.recent_days, k.prior_days, AT_RISK_REASON[k.reason] ?? k.reason]),
    ] },
    { name: 'Inactive', widths: [36, 28, 12, 12, 12, 8, 12, 12, 12], rows: [
      ['Email', 'Name', 'Joined', 'Last opened', 'Last sign-in', 'Days', 'App version', 'Platform', 'Account'],
      ...(i.list ?? []).map(k => [k.email, k.name ?? '', k.joined, k.last_open ?? '', k.last_sign_in ?? '', k.days_since, k.app_version ?? '', platformLabel(k.platform), k.status ?? 'active']),
    ] },
    { name: 'Versions & phones', widths: [24, 18, 10], rows: [
      ['What', 'Value', 'Agents'],
      ...[...d.versions].sort((p, q) => cmpVersionDesc(p.app_version, q.app_version)).map(v => ['App version', v.app_version, v.agents]),
      ...d.platforms.map(p => ['Platform', platformLabel(p.platform), p.agents]),
      ...d.devices.map(p => ['Phone model', `${p.device} (${platformLabel(p.platform)})`, p.agents]),
      ...d.languages.map(p => ['Language', languageLabel(p.language), p.agents]),
    ] },
    { name: 'Listings', widths: [36, 10], rows: [
      ['Status', 'Listings'], ...sortStatuses(l.by_status).map(s => [s.label, s.n]), [],
      ['Purpose', 'Listings'], ...Object.entries(l.by_purpose).map(([k, n]) => [PURPOSE_LABEL[k] ?? k, n]), [],
      ['Type', 'Listings'], ...l.by_type.map(t => [t.type, t.listings]), [],
      ['State', 'Listings'], ...l.by_state.map(t => [t.state, t.listings]), [],
      ['Pipeline — sale', 'Listings'], ...l.pipeline.sale.map(s => [PIPELINE_LABEL[s.stage] ?? s.stage, s.listings]), [],
      ['Pipeline — rent', 'Listings'], ...l.pipeline.rent.map(s => [PIPELINE_LABEL[s.stage] ?? s.stage, s.listings]),
    ] },
    { name: 'Stale listings', widths: [16, 36, 18, 14, 14, 32, 22, 8], rows: [
      ['Reference', 'Headline', 'Type', 'State', 'City', 'Agent', 'Last change', 'Days'],
      ...(l.stale ?? []).map(s => [s.ref ?? s.id, s.headline ?? '', s.type ?? '', s.state ?? '', s.city ?? '', s.email ?? '', fmtTime(s.updated_at), s.days]),
    ] },
    { name: 'Feature usage', widths: [10, 34, 10, 10, 10], rows: [
      ['Kind', 'Name', 'Times', 'Agents', 'Failed'],
      ...u.ranking.map(k => [kindLabel(k.kind), nameLabel(k.name), k.events, k.agents, k.failures]),
      [], ['Not used in the period'], ...u.not_used.map(k => [kindLabel(k.kind), nameLabel(k.name)]),
    ] },
  ];
}

export const dashFileName = (reference: string, ext: 'pdf' | 'xlsx') => `Dashboards-${reference}.${ext}`;

/** Gathers every dashboard for the period, registers the export (reference + access log), makes the file, saves it here. */
export async function exportDashboards(api: Api, adminEmail: string, format: 'pdf' | 'xlsx', from: string, to: string): Promise<{ reference: string; how: string }> {
  const [growth, active, retention, inactive, devices, listings, usage, companyName] = await Promise.all([
    api.dashGrowth(from, to, bucketFor(rangeDays({ from, to }))), api.dashActive(from, to), api.dashRetention(from, to), api.dashInactive(30),
    api.dashDevices(from, to), api.dashListings(from, to), api.dashUsage(from, to), api.settings().then(s => s.company_name).catch(() => undefined),
  ]);
  const reg = await api.startExport('dashboards', format, null, { from, to });
  const input: DashReportInput = { reference: reg.reference, createdAt: reg.at, adminEmail, companyName, from, to,
    data: { growth, active, retention, inactive, devices, listings, usage } };
  const name = dashFileName(reg.reference, format);
  const blob = format === 'pdf'
    ? await renderPagesToPdf(layoutDocument(buildDashDoc(input), canvasMeasure()), `Dashboards ${reg.reference}`)
    : new Blob([buildXlsx(buildDashSheets(input), { title: `Dashboards ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  return { reference: reg.reference, how: await saveLocally(blob, name) };
}
