// AdminBatch010 — reports for the Content insight screen (PDF / Excel) and the moderation register (Excel).
// Owner and Compliance only (the database refuses anyone else). Saved on this device, not in the Document Vault
// (same as the Market and Dashboards reports). Pure builders, so they are unit-tested.
import { Block, Doc, layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf } from '../lib/pdfRender';
import { AiUsage, Api, ContactStats, GeoAgents, MapListings, ModCases, ModSuspects, PriceTrends, StudioUsage } from '../api/admin';
import { Sheet, buildXlsx, XLSX_MIME } from './xlsx';
import { fmtTime } from './reports';
import { saveLocally } from './pack';
import { fmtNum, fmtPct0, languageLabel, rangeDays, statusLabel } from '../admin/dash';
import { fmtRm } from '../admin/market';
import { MOD_SOURCE_LABEL, channelLabel, contactRoleLabel, fmtPpsf, modReasonLabel, modStatusLabel, vendorStatusLabel } from '../admin/content';

export interface ContentData { map: MapListings; geo: GeoAgents; contacts: ContactStats; trends: PriceTrends; ai: AiUsage; studio: StudioUsage }
export interface ContentReportInput { reference: string; createdAt: string; adminEmail: string; companyName?: string; from: string; to: string; data: ContentData }

const who = (email: string | null | undefined, name: string | null | undefined) => (name ? `${name} (${email ?? '—'})` : email ?? '—');

export function buildContentDoc(x: ContentReportInput): Doc {
  const { map: m, geo: g, contacts: c, trends: t, ai: a, studio: s } = x.data;
  const b: Block[] = [
    { t: 'title', text: 'Content insight report', sub: `${x.companyName ?? ''}${x.companyName ? ' · ' : ''}Estate Agent AI Buddy` },
    { t: 'rows', rows: [
      { k: 'Reference', v: x.reference, strong: true },
      { k: 'Period', v: `${x.from} to ${x.to} (${rangeDays(x)} days, Malaysia dates) — buyers & vendors, AI commands and Marketing Studio` },
      { k: 'Made', v: `${fmtTime(x.createdAt)} by ${x.adminEmail}` },
      { k: 'Contains', v: 'Totals, plus counts per named agent (buyers & vendors, AI commands, Marketing Studio). No contact names or phone numbers.' },
    ] },
    { t: 'heading', text: 'Listings on the map (on the market now)' },
    { t: 'rows', rows: [
      { k: 'Listings', v: fmtNum(m.listings) }, { k: 'With a map pin', v: fmtNum(m.with_pin) },
      { k: 'Without a map pin', v: fmtNum(m.listings - m.with_pin), warn: m.listings - m.with_pin > 0 },
    ] },
    { t: 'heading', text: 'Where agents are' },
    { t: 'rows', rows: [
      { k: 'Agents', v: fmtNum(g.agents) }, { k: 'With listings (state known)', v: fmtNum(g.with_listings) },
      ...g.by_country.map(r => ({ k: `  ${r.country}`, v: `${fmtNum(r.agents)} agents`, sub: true })),
      ...g.by_state.slice(0, 20).map(r => ({ k: `  State: ${r.state}`, v: `${fmtNum(r.agents)} agents`, sub: true })),
    ] },
    { t: 'heading', text: 'Buyers and vendors (counts only)' },
    { t: 'rows', rows: [
      { k: 'Contacts', v: `${fmtNum(c.contacts)} (${fmtNum(c.new_in_period)} new in the period)` },
      { k: 'Buyers / vendors', v: `${fmtNum(c.buyers)} / ${fmtNum(c.vendors)} (${fmtNum(c.vendors_with_listing)} vendors linked to a listing)` },
      { k: 'Contacts in a deal', v: fmtNum(c.in_a_deal) },
      { k: 'Enquiries in the period', v: fmtNum(c.enquiries) },
      ...c.by_role.map(r => ({ k: `  ${contactRoleLabel(r.role)}`, v: `${fmtNum(r.contacts)} (${fmtNum(r.new)} new)`, sub: true })),
      ...c.enquiries_by_channel.map(r => ({ k: `  Enquiries: ${channelLabel(r.channel)}`, v: fmtNum(r.enquiries), sub: true })),
    ] },
    { t: 'heading', text: `Price trends (listings added in the last ${t.months} months)` },
    { t: 'rows', rows: [
      { k: 'Median sale price', v: `${fmtRm(t.sale.median_price)} (${fmtNum(t.sale.listings)} listings)`, strong: true },
      { k: 'Median price per sq ft', v: fmtPpsf(t.sale.median_ppsf) },
      { k: 'Median monthly rent', v: `${fmtRm(t.rent.median_rent)} (${fmtNum(t.rent.listings)} listings)` },
      ...t.by_area.slice(0, 30).map(r => ({ k: `  ${r.city}, ${r.state}`,
        v: `${r.listings} · median ${fmtRm(r.median_price, true)} · ${fmtPpsf(r.median_ppsf)}${r.change_pct === null ? '' : ` · ${r.change_pct > 0 ? '+' : ''}${r.change_pct}% (6 months)`}`, sub: true })),
    ] },
    { t: 'heading', text: 'AI Assisted Command' },
    { t: 'rows', rows: [
      { k: 'Commands', v: `${fmtNum(a.commands)} by ${fmtNum(a.agents)} agents` },
      { k: 'Understood', v: `${fmtPct0(a.success_pct)} (${fmtNum(a.not_understood)} not understood)`, strong: true, warn: (a.success_pct ?? 100) < 80 },
      ...a.by_version.map(v => ({ k: `  Version ${v.version}`, v: `${v.commands} commands · ${fmtPct0(v.success_pct)} understood`, sub: true })),
      ...a.by_language.map(v => ({ k: `  ${languageLabel(v.language)}`, v: `${v.commands} commands · ${fmtPct0(v.success_pct)} understood`, sub: true })),
      ...(a.list ?? []).slice(0, 50).map(r => ({ k: `  ${who(r.email, r.name)}`, v: `${r.commands} commands · ${r.not_understood} not understood`, sub: true })),
    ] },
    { t: 'heading', text: 'Marketing Studio' },
    { t: 'rows', rows: [
      { k: 'Opened / posters made / saved / shared', v: `${fmtNum(s.opened)} / ${fmtNum(s.created)} / ${fmtNum(s.saved)} / ${fmtNum(s.shared)}` },
      { k: 'Share rate', v: fmtPct0(s.share_pct) },
      ...(s.list ?? []).slice(0, 50).map(r => ({ k: `  ${who(r.email, r.name)}`, v: `${r.created} made · ${r.shared} shared`, sub: true })),
    ] },
    { t: 'text', text: 'Limits: the main app does not keep old prices (price trends show what was listed each month), does not record the words of AI commands, and does not record buyer requirements.', small: true },
    { t: 'text', text: 'Generated by Admin EAB from the live database. This export is recorded in the tamper-proof access log under the reference above.', small: true, muted: true },
  ];
  return { blocks: b, footer: `${x.reference} · Content insight ${x.from} to ${x.to} · ${fmtTime(x.createdAt)}` };
}

export function buildContentSheets(x: ContentReportInput): Sheet[] {
  const { map: m, geo: g, contacts: c, trends: t, ai: a, studio: s } = x.data;
  return [
    { name: 'Summary', widths: [42, 60], rows: [
      ['Content insight report', x.reference], ['Period', `${x.from} to ${x.to}`], ['Made', `${fmtTime(x.createdAt)} by ${x.adminEmail}`], ['Company', x.companyName ?? ''],
      [], ['Listings on the market', m.listings], ['With a map pin', m.with_pin], ['Agents', g.agents],
      ['Contacts', c.contacts], ['Buyers', c.buyers], ['Vendors', c.vendors], ['Enquiries in period', c.enquiries],
      ['Median sale price RM', t.sale.median_price ?? ''], ['Median RM per sq ft', t.sale.median_ppsf ?? ''], ['Median monthly rent RM', t.rent.median_rent ?? ''],
      ['AI commands', a.commands], ['AI understood %', a.success_pct ?? ''], ['Studio posters made', s.created], ['Studio posters shared', s.shared],
    ] },
    { name: 'Map listings', widths: [16, 30, 18, 20, 10, 14, 16, 16, 12, 12, 32], rows: [
      ['Reference', 'Headline', 'Type', 'Status', 'Side', 'Price RM', 'State', 'City', 'Lat', 'Lng', 'Agent'],
      ...m.points.map(p => [p.ref ?? '', p.headline ?? '', p.type ?? '', statusLabel(p.status), p.side, p.price ?? '', p.state ?? '', p.city ?? '', p.lat, p.lng, p.email ?? '']),
    ] },
    { name: 'Geography', widths: [24, 24, 10], rows: [
      ['Country', '', 'Agents'], ...g.by_country.map(r => [r.country, '', r.agents]), [],
      ['State', '', 'Agents'], ...g.by_state.map(r => [r.state, '', r.agents]), [],
      ['State', 'City', 'Agents'], ...g.by_city.map(r => [r.state, r.city, r.agents]),
    ] },
    { name: 'Buyers & vendors', widths: [32, 12, 12, 12, 12, 12], rows: [
      ['Role', 'Contacts', 'New in period'], ...c.by_role.map(r => [contactRoleLabel(r.role), r.contacts, r.new]), [],
      ['Vendor status', 'Vendors'], ...Object.entries(c.vendor_status).map(([k, n]) => [vendorStatusLabel(k), n]), [],
      ['Enquiry channel', 'Enquiries'], ...c.enquiries_by_channel.map(r => [channelLabel(r.channel), r.enquiries]), [],
      ['Month', 'Buyers', 'Vendors', 'Others'], ...c.by_month.map(r => [r.month, r.buyers, r.vendors, r.others]), [],
      ['Agent', 'Contacts', 'Buyers', 'Vendors', 'New in period', 'Enquiries'], ...(c.agents ?? []).map(r => [r.email ?? '', r.contacts, r.buyers, r.vendors, r.new, r.enquiries]),
    ] },
    { name: 'Price trends', widths: [20, 22, 10, 16, 14, 14, 14, 10], rows: [
      ['Month', '', 'Sale listings', 'Median price RM', 'Median psf RM', 'Rent listings', 'Median rent RM'],
      ...t.by_month.map(r => [r.month, '', r.sale_listings, r.median_price ?? '', r.median_ppsf ?? '', r.rent_listings, r.median_rent ?? '']), [],
      ['State', 'City', 'Listings', 'Median price RM', 'Median psf RM', 'Last 6 months psf', '6 months before', 'Change %'],
      ...t.by_area.map(r => [r.state, r.city, r.listings, r.median_price ?? '', r.median_ppsf ?? '', r.recent_ppsf ?? '', r.before_ppsf ?? '', r.change_pct ?? '']), [],
      ['Type', '', 'Listings', 'Median price RM', 'Median psf RM', 'Median rent RM'],
      ...t.by_type.map(r => [r.type, '', r.listings, r.median_price ?? '', r.median_ppsf ?? '', r.median_rent ?? '']),
    ] },
    { name: 'AI commands', widths: [32, 12, 14, 12, 20], rows: [
      ['Day', 'Understood', 'Not understood'], ...a.by_day.map(r => [r.day, r.understood, r.not_understood]), [],
      ['App version', 'Commands', 'Not understood', 'Understood %'], ...a.by_version.map(r => [r.version, r.commands, r.not_understood, r.success_pct ?? '']), [],
      ['Language', 'Commands', 'Not understood', 'Understood %'], ...a.by_language.map(r => [languageLabel(r.language), r.commands, r.not_understood, r.success_pct ?? '']), [],
      ['Agent', 'Commands', 'Not understood', 'Understood %', 'Last used'], ...(a.list ?? []).map(r => [r.email ?? '', r.commands, r.not_understood, r.success_pct ?? '', fmtTime(r.last_at)]),
    ] },
    { name: 'Marketing Studio', widths: [32, 10, 10, 10, 10, 20], rows: [
      ['Day', 'Made', 'Saved', 'Shared'], ...s.by_day.map(r => [r.day, r.created, r.saved, r.shared]), [],
      ['Agent', 'Opened', 'Made', 'Saved', 'Shared', 'Last used'], ...(s.list ?? []).map(r => [r.email ?? '', r.opened, r.created, r.saved, r.shared, fmtTime(r.last_at)]),
    ] },
  ];
}

export const contentFileName = (reference: string, ext: 'pdf' | 'xlsx') => `Content-${reference}.${ext}`;

/** Gathers every tab, registers the export (reference + access log), makes the file, saves it here. */
export async function exportContent(api: Api, adminEmail: string, format: 'pdf' | 'xlsx', from: string, to: string): Promise<{ reference: string; how: string }> {
  const [map, geo, contacts, trends, ai, studio, companyName] = await Promise.all([
    api.mapListings('open'), api.geoAgents(), api.contactStats(from, to), api.priceTrends(12), api.aiUsage(from, to), api.studioUsage(from, to),
    api.settings().then(s => s.company_name).catch(() => undefined),
  ]);
  const reg = await api.startExport('content_report', format, null, { from, to });
  const input: ContentReportInput = { reference: reg.reference, createdAt: reg.at, adminEmail, companyName, from, to, data: { map, geo, contacts, trends, ai, studio } };
  const name = contentFileName(reg.reference, format);
  const blob = format === 'pdf'
    ? await renderPagesToPdf(layoutDocument(buildContentDoc(input), canvasMeasure()), `Content insight ${reg.reference}`)
    : new Blob([buildXlsx(buildContentSheets(input), { title: `Content insight ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  return { reference: reg.reference, how: await saveLocally(blob, name) };
}

// ---------------------------------------------------------------- moderation register (Excel)
export interface ModRegisterInput { reference: string; createdAt: string; adminEmail: string; cases: ModCases; suspects: ModSuspects }

export function buildModerationSheets(x: ModRegisterInput): Sheet[] {
  return [
    { name: 'Cases', widths: [16, 12, 10, 30, 32, 16, 22, 24, 50, 40, 18], rows: [
      ['Reference', 'Status', 'Kind', 'Reason', 'Agent', 'Listing', 'Raised', 'How raised', 'What is wrong', 'Outcome', 'Updated'],
      ...x.cases.cases.map(c => [c.ref, modStatusLabel(c.status), c.kind, modReasonLabel(c.reason), c.agent_email ?? '', c.listing_ref ?? '',
        fmtTime(c.created_at), MOD_SOURCE_LABEL[c.source] ?? c.source, c.summary ?? c.details ?? '', c.outcome ?? '', fmtTime(c.updated_at)]),
    ] },
    { name: 'Automatic checks', widths: [16, 30, 18, 20, 32, 70], rows: [
      ['Reference', 'Headline', 'Type', 'City', 'Agent', 'Why'],
      ...x.suspects.listings.map(l => [l.ref ?? l.id, l.headline ?? '', l.type ?? '', l.city ?? '', l.email ?? '',
        l.reasons.map(r => `${modReasonLabel(r.reason)}: ${r.detail}${r.case_ref ? ` (${r.case_ref})` : ''}`).join('; ')]),
    ] },
    { name: 'About', widths: [30, 70], rows: [
      ['Moderation register', x.reference], ['Made', `${fmtTime(x.createdAt)} by ${x.adminEmail}`],
      ['Note', 'Cases are never deleted. Moderation records decisions only; nothing in the agents\' app is hidden or changed.'],
    ] },
  ];
}

export async function exportModeration(api: Api, adminEmail: string): Promise<{ reference: string; how: string }> {
  const [cases, suspects] = await Promise.all([api.modCases(null), api.modSuspects()]);
  const reg = await api.startExport('moderation_register', 'xlsx', null, { cases: cases.cases.length });
  const input: ModRegisterInput = { reference: reg.reference, createdAt: reg.at, adminEmail, cases, suspects };
  const blob = new Blob([buildXlsx(buildModerationSheets(input), { title: `Moderation register ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  return { reference: reg.reference, how: await saveLocally(blob, `Moderation-${reg.reference}.xlsx`) };
}
