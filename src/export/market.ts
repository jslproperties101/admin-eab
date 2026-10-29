// AdminBatch009 — Listings & market report (PDF / Excel): quality score, days on market, asking vs final price, hot areas,
// stuck deals, commission forecast, project and Market News engagement.
// Owner and Compliance only (the database refuses anyone else). Saved on this device, not in the Document Vault
// (same as the Dashboards and Health reports). Pure builders, so they are unit-tested.
import { Block, Doc, layoutDocument } from '../lib/pdf';
import { canvasMeasure, renderPagesToPdf } from '../lib/pdfRender';
import { Api, MarketAreas, MarketCommission, MarketDom, MarketNews, MarketPrice, MarketProjects, MarketQuality, MarketStuck } from '../api/admin';
import { Sheet, buildXlsx, XLSX_MIME } from './xlsx';
import { fmtTime } from './reports';
import { saveLocally } from './pack';
import { fmtNum, fmtPct0, languageLabel, rangeDays } from '../admin/dash';
import {
  BAND_LABEL, GOOD_SCORE, MISSING_ORDER, STUCK_DAYS, audienceLabel, fmtDays, fmtHours, fmtRm, fmtSignedPct, missingLabel, monthLabel, sideLabel,
  slotLabel, stageLabel,
} from '../admin/market';

export interface MarketData {
  quality: MarketQuality; dom: MarketDom; price: MarketPrice; areas: MarketAreas; stuck: MarketStuck;
  commission: MarketCommission; projects: MarketProjects; news: MarketNews;
}
export interface MarketReportInput { reference: string; createdAt: string; adminEmail: string; companyName?: string; from: string; to: string; data: MarketData }

const who = (email: string | null, name: string | null) => (name ? `${name} (${email ?? '—'})` : email ?? '—');

export function buildMarketDoc(x: MarketReportInput): Doc {
  const { quality: q, dom: d, price: p, areas: a, stuck: s, commission: c, projects: pr, news: n } = x.data;
  const b: Block[] = [
    { t: 'title', text: 'Listings & market report', sub: `${x.companyName ?? ''}${x.companyName ? ' · ' : ''}Estate Agent AI Buddy` },
    { t: 'rows', rows: [
      { k: 'Reference', v: x.reference, strong: true },
      { k: 'Period', v: `${x.from} to ${x.to} (${rangeDays(x)} days, Malaysia dates)` },
      { k: 'Made', v: `${fmtTime(x.createdAt)} by ${x.adminEmail}` },
      { k: 'Contains', v: 'Totals, plus lists of named agents (listings needing work, deals compared, stuck deals, commission by agent).' },
    ] },
    { t: 'heading', text: 'Listing quality (on the market now)' },
    { t: 'rows', rows: [
      { k: 'Listings scored', v: fmtNum(q.listings) },
      { k: 'Average score', v: q.average === null ? '—' : `${fmtNum(q.average, 1)} / 100`, strong: true },
      { k: BAND_LABEL.good, v: fmtNum(q.bands.good) }, { k: BAND_LABEL.fair, v: fmtNum(q.bands.fair) }, { k: BAND_LABEL.poor, v: fmtNum(q.bands.poor), warn: q.bands.poor > 0 },
      ...MISSING_ORDER.filter(k => q.missing[k]).map(k => ({ k: `  ${missingLabel(k)}`, v: `${fmtNum(q.missing[k])} listings`, sub: true })),
      { k: `Needs work (below ${q.below})`, v: fmtNum(q.weak_count), warn: q.weak_count > 0 },
      ...(q.weak ?? []).slice(0, 100).map(w => ({ k: `  ${w.ref ?? w.id} · ${w.score}`, v: `${who(w.email, w.name)} · ${w.missing.map(missingLabel).join(', ')}`, sub: true })),
    ] },
    { t: 'heading', text: 'Days on market' },
    { t: 'rows', rows: [
      { k: 'On the market now', v: fmtNum(d.open.listings) },
      { k: 'Median days listed', v: fmtDays(d.open.median) },
      { k: 'Under 30 / 30-89 / 90-179 / 180+ days', v: `${d.open.buckets.under_30} / ${d.open.buckets.d30_89} / ${d.open.buckets.d90_179} / ${d.open.buckets.d180_plus}` },
      { k: 'Sold or rented in the period', v: `${fmtNum(d.closed.listings)} · median ${fmtDays(d.closed.median)} to close (estimate)` },
      ...d.by_state.map(r => ({ k: `  ${r.state}`, v: `${r.open} on market · median ${fmtDays(r.median)} · oldest ${fmtDays(r.oldest)}`, sub: true })),
    ] },
    { t: 'heading', text: 'Asking vs final price' },
    { t: 'rows', rows: [
      { k: 'Deals in the period', v: `${fmtNum(p.deals)} (${fmtNum(p.compared)} compared, ${fmtNum(p.not_linked)} not linked to a listing)` },
      { k: 'Median difference', v: fmtSignedPct(p.median_pct), strong: true },
      { k: 'Average difference', v: fmtSignedPct(p.average_pct) },
      { k: 'Below / at / above asking', v: `${p.below} / ${p.at} / ${p.above}` },
      ...p.by_state.map(r => ({ k: `  ${r.state}`, v: `${r.deals} deals · median ${fmtSignedPct(r.median_pct)}`, sub: true })),
      ...(p.list ?? []).slice(0, 100).map(r => ({ k: `  ${r.date} ${r.ref ?? ''}`, v: `${fmtRm(r.asking)} -> ${fmtRm(r.final)} (${fmtSignedPct(r.pct)}) · ${who(r.email, r.name)}`, sub: true })),
    ] },
    { t: 'heading', text: 'Hot areas' },
    { t: 'rows', rows: [
      { k: 'On the market now', v: fmtNum(a.on_market) }, { k: 'New listings in the period', v: fmtNum(a.new) },
      { k: 'Enquiries in the period', v: `${fmtNum(a.enquiries)} (${fmtNum(a.enquiries_unlinked)} not about a listing)` },
      ...a.by_city.slice(0, 30).map(r => ({ k: `  ${r.city}, ${r.state}`, v: `${r.on_market} on market · ${r.enquiries} enquiries · ${r.per_listing ?? '—'} per listing`, sub: true })),
    ] },
    { t: 'heading', text: `Stuck deals (no change for ${s.days}+ days)` },
    { t: 'rows', rows: [
      { k: 'Booked, before SPA signed', v: fmtNum(s.booked) },
      { k: 'Stuck', v: fmtNum(s.stuck_count), warn: s.stuck_count > 0, strong: true },
      ...s.by_stage.map(r => ({ k: `  ${stageLabel(r.stage)}`, v: `${r.stuck} of ${r.booked} · oldest ${fmtDays(r.oldest)}`, sub: true })),
      ...(s.list ?? []).slice(0, 100).map(r => ({ k: `  ${r.ref ?? r.id}`, v: `${stageLabel(r.stage)} · ${r.days} days · ${who(r.email, r.name)}`, sub: true })),
    ] },
    { t: 'heading', text: 'Commission forecast' },
    { t: 'rows', rows: [
      { k: 'Open deals (any date)', v: `${fmtNum(c.open.deals)} · worth ${fmtRm(c.open.value)}` },
      { k: 'Expected commission', v: fmtRm(c.open.commission), strong: true },
      { k: '  Confirmed / estimated', v: `${fmtRm(c.open.confirmed)} / ${fmtRm(c.open.estimated)}`, sub: true },
      { k: 'Agents share', v: fmtRm(c.open.agents_share) },
      { k: 'Received in the period', v: `${fmtRm(c.received.commission)} (${fmtNum(c.received.deals)} deals)` },
      ...c.by_month.map(m => ({ k: `  ${monthLabel(m.month)}`, v: `${fmtRm(m.commission)} · ${m.deals} deals`, sub: true })),
      ...(c.agents ?? []).slice(0, 50).map(r => ({ k: `  ${who(r.email, r.name)}`, v: `${r.deals} deals · ${fmtRm(r.commission)}`, sub: true })),
    ] },
    { t: 'heading', text: 'Pushed projects' },
    { t: 'rows', rows: [
      { k: 'Projects / reached / opened / codes redeemed', v: `${pr.projects} / ${pr.reached} / ${pr.opened} / ${pr.redeemed}` },
      ...pr.list.slice(0, 50).map(r => ({ k: `  ${r.title}`, v: `${r.opened} of ${r.reached} opened (${fmtPct0(r.open_pct)}) · ${r.redeemed} codes`, sub: true })),
    ] },
    { t: 'heading', text: 'Market News engagement' },
    { t: 'rows', rows: [
      { k: 'Posts in the period', v: fmtNum(n.posts) },
      { k: 'Open rate', v: `${fmtPct0(n.open_pct)} (${fmtNum(n.opened)} of ${fmtNum(n.reached)})`, strong: true },
      { k: 'With / without push alert', v: `${fmtPct0(n.with_alert.open_pct)} / ${fmtPct0(n.without_alert.open_pct)}` },
      { k: 'Best times to post', v: n.best.map(t => slotLabel(t.dow, t.hour)).join('; ') || '—' },
      ...n.by_language.map(l => ({ k: `  ${languageLabel(l.language)}`, v: `${fmtPct0(l.open_pct)} (${l.opened} of ${l.reached})`, sub: true })),
      ...n.by_group.map(g => ({ k: `  Group: ${g.group}`, v: `${fmtPct0(g.open_pct)} (${g.opened} of ${g.reached})`, sub: true })),
    ] },
    { t: 'text', text: 'Limits: the main app does not yet record old prices, a separate final price, buyer requirements, the date a Booked stage started, or project enquiries. Days to close and stuck deals use the listing last change.', small: true },
    { t: 'text', text: 'Generated by Admin EAB from the live database. This export is recorded in the tamper-proof access log under the reference above.', small: true, muted: true },
  ];
  return { blocks: b, footer: `${x.reference} · Listings & market ${x.from} to ${x.to} · ${fmtTime(x.createdAt)}` };
}

export function buildMarketSheets(x: MarketReportInput): Sheet[] {
  const { quality: q, dom: d, price: p, areas: a, stuck: s, commission: c, projects: pr, news: n } = x.data;
  return [
    { name: 'Summary', widths: [40, 60], rows: [
      ['Listings & market report', x.reference], ['Period', `${x.from} to ${x.to}`], ['Made', `${fmtTime(x.createdAt)} by ${x.adminEmail}`], ['Company', x.companyName ?? ''],
      [], ['Listings scored', q.listings], ['Average quality score', q.average ?? ''], [`Needs work (below ${q.below})`, q.weak_count],
      ['On the market now', d.open.listings], ['Median days listed', d.open.median ?? ''], ['Sold or rented in period', d.closed.listings],
      ['Deals compared (asking vs final)', p.compared], ['Median difference %', p.median_pct ?? ''],
      ['Enquiries in period', a.enquiries], [`Stuck deals (${s.days}+ days)`, s.stuck_count],
      ['Open deals', c.open.deals], ['Expected commission RM', c.open.commission], ['Agents share RM', c.open.agents_share], ['Received in period RM', c.received.commission],
      ['Projects', pr.projects], ['Project opens', pr.opened], ['Code redemptions', pr.redeemed],
      ['News posts', n.posts], ['News open rate %', n.open_pct ?? ''],
    ] },
    { name: 'Quality', widths: [16, 34, 18, 14, 14, 32, 8, 8, 60], rows: [
      ['Reference', 'Headline', 'Type', 'State', 'City', 'Agent', 'Score', 'Photos', 'Missing'],
      ...(q.weak ?? []).map(w => [w.ref ?? w.id, w.headline ?? '', w.type ?? '', w.state ?? '', w.city ?? '', w.email ?? '', w.score, w.photos, w.missing.map(missingLabel).join(', ')]),
      [], ['Missing', 'Listings'], ...MISSING_ORDER.filter(k => q.missing[k]).map(k => [missingLabel(k), q.missing[k]]),
    ] },
    { name: 'Days on market', widths: [12, 26, 26, 10, 12, 10, 10, 10, 12], rows: [
      ['Level', 'Name', 'State', 'On market', 'Median days', 'Average', 'Oldest', 'Closed', 'Median to close'],
      ...d.by_state.map(r => ['State', r.state, r.state, r.open, r.median ?? '', r.average ?? '', r.oldest ?? '', r.closed, r.closed_median ?? '']),
      ...d.by_city.map(r => ['City', r.city, r.state, r.open, r.median ?? '', r.average ?? '', r.oldest ?? '', r.closed, r.closed_median ?? '']),
      ...d.by_type.map(r => ['Type', r.type, '', r.open, r.median ?? '', r.average ?? '', r.oldest ?? '', r.closed, r.closed_median ?? '']),
    ] },
    { name: 'Asking vs final', widths: [12, 10, 16, 30, 18, 14, 14, 32, 14, 14, 10], rows: [
      ['Date', 'Side', 'Reference', 'Headline', 'Type', 'State', 'City', 'Agent', 'Asking RM', 'Final RM', 'Difference %'],
      ...(p.list ?? []).map(r => [r.date, sideLabel(r.side), r.ref ?? '', r.headline ?? '', r.type ?? '', r.state ?? '', r.city ?? '', r.email ?? '', r.asking, r.final, r.pct]),
    ] },
    { name: 'Hot areas', widths: [20, 22, 12, 12, 12, 10, 10], rows: [
      ['State', 'City', 'On market', 'Enquiries', 'Per listing', 'New', 'Closed'],
      ...a.by_city.map(r => [r.state, r.city, r.on_market, r.enquiries, r.per_listing ?? '', r.new, r.closed]),
    ] },
    { name: 'Stuck deals', widths: [16, 30, 26, 14, 14, 32, 14, 20, 8], rows: [
      ['Reference', 'Headline', 'Stage', 'State', 'City', 'Agent', 'Asking RM', 'Last change', 'Days'],
      ...(s.list ?? []).map(r => [r.ref ?? r.id, r.headline ?? '', stageLabel(r.stage), r.state ?? '', r.city ?? '', r.email ?? '', r.asking ?? '', fmtTime(r.updated_at), r.days]),
    ] },
    { name: 'Commission', widths: [26, 10, 16, 16, 16], rows: [
      ['Month', 'Deals', 'Estimated RM', 'Confirmed RM', 'Total RM'], ...c.by_month.map(m => [m.month, m.deals, m.estimated, m.confirmed, m.commission]), [],
      ['Stage', 'Deals', 'Commission RM'], ...c.by_stage.map(r => [stageLabel(r.stage), r.deals, r.commission]), [],
      ['Agent', 'Deals', 'Commission RM', 'Agent share RM', 'Next deal date'], ...(c.agents ?? []).map(r => [r.email ?? '', r.deals, r.commission, r.agents_share, r.next_date ?? '']),
    ] },
    { name: 'Projects', widths: [36, 20, 18, 20, 10, 10, 10, 10, 8], rows: [
      ['Project', 'Developer', 'Audience', 'Published', 'Reached', 'Opened', 'Open %', 'Redeemed', 'Codes'],
      ...pr.list.map(r => [r.title, r.developer ?? '', audienceLabel(r.audience), fmtTime(r.published_at), r.reached, r.opened, r.open_pct ?? '', r.redeemed, r.codes]),
    ] },
    { name: 'News', widths: [40, 20, 18, 8, 10, 10, 10, 14], rows: [
      ['Post', 'Published', 'Audience', 'Alert', 'Reached', 'Opened', 'Open %', 'Half opened within'],
      ...n.list.map(r => [r.title, fmtTime(r.published_at), audienceLabel(r.audience), r.push_alert ? 'yes' : 'no', r.reached, r.opened, r.open_pct ?? '', fmtHours(r.median_hours)]),
      [], ['Language', 'Reached', 'Opened', 'Open %'], ...n.by_language.map(l => [languageLabel(l.language), l.reached, l.opened, l.open_pct ?? '']),
      [], ['Group', 'Reached', 'Opened', 'Open %'], ...n.by_group.map(g => [g.group, g.reached, g.opened, g.open_pct ?? '']),
      [], ['Best time', 'Opens'], ...n.best.map(t => [slotLabel(t.dow, t.hour), t.opens]),
    ] },
  ];
}

export const marketFileName = (reference: string, ext: 'pdf' | 'xlsx') => `Market-${reference}.${ext}`;

/** Gathers every tab for the period, registers the export (reference + access log), makes the file, saves it here. */
export async function exportMarket(api: Api, adminEmail: string, format: 'pdf' | 'xlsx', from: string, to: string): Promise<{ reference: string; how: string }> {
  const [quality, dom, price, areas, stuck, commission, projects, news, companyName] = await Promise.all([
    api.marketQuality(GOOD_SCORE, 500), api.marketDom(from, to), api.marketPrice(from, to), api.marketAreas(from, to), api.marketStuck(STUCK_DAYS),
    api.marketCommission(from, to), api.marketProjects(from, to), api.marketNews(from, to), api.settings().then(s => s.company_name).catch(() => undefined),
  ]);
  const reg = await api.startExport('market_report', format, null, { from, to });
  const input: MarketReportInput = { reference: reg.reference, createdAt: reg.at, adminEmail, companyName, from, to,
    data: { quality, dom, price, areas, stuck, commission, projects, news } };
  const name = marketFileName(reg.reference, format);
  const blob = format === 'pdf'
    ? await renderPagesToPdf(layoutDocument(buildMarketDoc(input), canvasMeasure()), `Listings & market ${reg.reference}`)
    : new Blob([buildXlsx(buildMarketSheets(input), { title: `Listings & market ${reg.reference}`, author: adminEmail }) as BlobPart], { type: XLSX_MIME });
  return { reference: reg.reference, how: await saveLocally(blob, name) };
}
