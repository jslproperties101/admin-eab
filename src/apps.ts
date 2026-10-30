// AdminBatch010: one admin codebase for every AI Buddy app. Each app below is an admin "space" with its own feature list.
// The same code builds:
//   - the combined admin (EAB_APP=all): sign in once, switch between apps at the top of Home;
//   - one standalone admin per app (EAB_APP=eab|pos|mm2h|odw|biz): its own name and Android package, only that app.
// Sign-in, roles, the allow-list and the two tamper-proof logs are shared by all of them (the eab_admin_* functions).
// `open` features work now. `blocked` says in plain words what each app still needs before its admin data can show.
import { SECTIONS as EAB_SECTIONS, Section } from './screens/features';
import { View } from './ctx';

export type AppId = 'eab' | 'pos' | 'mm2h' | 'odw' | 'biz';
export type BuildApp = AppId | 'all';

export interface AdminApp {
  id: AppId;
  product: string;   // the app being administered
  admin: string;     // the admin app's own name (standalone build)
  androidId: string; // Android package of the standalone admin build
  where: string;     // where that app's data lives today, in plain words
  sections: Section[];
}

const LOGS_A: View = { k: 'logs', tab: 'actions' };
const LOGS_V: View = { k: 'logs', tab: 'access' };
const SEARCH: View = { k: 'search' };

/** Audit logs and admin roles are shared by every app, so each app's space opens the same screens. */
const shared = (): Section => ({ title: 'Shared admin tools', items: [
  { n: 18, name: 'Master Audit Log', open: LOGS_A, needs: 'viewLogs' },
  { n: 74, name: 'Who Viewed What', open: LOGS_V, needs: 'viewLogs' },
  { n: 73, name: 'Log Integrity Check', open: LOGS_A, needs: 'viewLogs' },
  { n: 17, name: 'Admins & Roles', open: { k: 'admins' }, needs: 'manageAdmins' },
] });

/** Operations every app needs; the data for each comes once that app is linked. */
const ops = (blocked: string): Section => ({ title: 'Operations', items: [
  { n: 'O1', name: 'Users Overview', blocked },
  { n: 'O2', name: 'Sign-ups & Active Users', blocked },
  { n: 'O3', name: 'Announcements & Push', blocked },
  { n: 'O4', name: 'Support Tickets', blocked },
  { n: 'O5', name: 'Feature Flags', blocked },
  { n: 'O6', name: 'Maintenance Mode', blocked },
  { n: 'O7', name: 'App Release Manager', blocked },
  { n: 'O8', name: 'Error Logs & Crashes', blocked },
] });

const POS_WAIT = 'Needs the POS module synced to the server';
const MM2H_WAIT = 'Needs a server connection in the app (its data stays on the phone)';
const ODW_WAIT = 'On Da Way not linked yet';
const BIZ_WAIT = 'Needs AI Buddy Biz database linked';

export const APPS: AdminApp[] = [
  {
    id: 'eab', product: 'Estate Agent AI Buddy', admin: 'Admin EAB', androidId: 'com.jslproperties.admineab',
    where: 'Shared database with Estate Agent AI Buddy',
    sections: EAB_SECTIONS,
  },
  {
    id: 'pos', product: 'AI Buddy POS', admin: 'Admin POS', androidId: 'com.jslproperties.adminpos',
    where: 'Accounting module inside Estate Agent AI Buddy (same database; switched off by default)',
    sections: [
      { title: 'Businesses', items: [
        { n: 'P1', name: 'Business Owner Records', open: SEARCH, needs: 'viewAgent', note: 'Find the owner; synced POS records show in their profile' },
        { n: 'P2', name: 'Businesses Overview', blocked: POS_WAIT },
        { n: 'P3', name: 'Module Switch per Account', blocked: POS_WAIT },
      ] },
      { title: 'Sales & Accounts', items: [
        { n: 'P4', name: 'Sales & POS Transactions', blocked: POS_WAIT },
        { n: 'P5', name: 'Ledger & Journal Postings', blocked: POS_WAIT },
        { n: 'P6', name: 'Profit & Loss', blocked: POS_WAIT },
        { n: 'P7', name: 'Invoices & Receipts', blocked: POS_WAIT },
        { n: 'P8', name: 'LHDN MyInvois Status (sandbox)', blocked: POS_WAIT },
        { n: 'P9', name: 'SST & Tax Settings', blocked: POS_WAIT },
      ] },
      { title: 'People', items: [
        { n: 'P10', name: 'Customers (CRM)', blocked: POS_WAIT },
        { n: 'P11', name: 'Attendance', blocked: POS_WAIT },
        { n: 'P12', name: 'Payroll Runs', blocked: POS_WAIT },
      ] },
      { title: 'Payments (test mode only)', items: [
        { n: 'P13', name: 'FPX / Stripe / Google Play Test Payments', blocked: 'Gateways are in sandbox; no live money' },
        { n: 'P14', name: 'Plans & Entitlements', blocked: POS_WAIT },
        { n: 'P15', name: 'Refunds & Disputes', blocked: 'Gateways are in sandbox; no live money' },
      ] },
      ops(POS_WAIT),
      shared(),
    ],
  },
  {
    id: 'mm2h', product: 'Malaysia Welcome AI Buddy (MM2H)', admin: 'Admin MM2H', androidId: 'com.jslproperties.adminmm2h',
    where: 'On each family’s phone only — nothing is sent to a server yet',
    sections: [
      { title: 'Content the families see', items: [
        { n: 'M17', name: 'News Sources', blocked: MM2H_WAIT },
        { n: 'M18', name: 'Hotspots', blocked: MM2H_WAIT },
        { n: 'M19', name: 'Coupons & Partners', blocked: MM2H_WAIT },
        { n: 'M13', name: 'Services Directory', blocked: MM2H_WAIT },
        { n: 'M11', name: 'Local Life Guide', blocked: MM2H_WAIT },
        { n: 'M8', name: 'Schools & Education List', blocked: MM2H_WAIT },
        { n: 'M9', name: 'Healthcare & Insurance List', blocked: MM2H_WAIT },
        { n: 'M7', name: 'Housing Listings', blocked: MM2H_WAIT },
        { n: 'M12', name: 'AI Buddy Knowledge', blocked: MM2H_WAIT },
        { n: 'M0', name: 'MM2H Rules & Figures (official refs)', blocked: MM2H_WAIT },
      ] },
      { title: 'Families & Applications', items: [
        { n: 'M2', name: 'Application Tracker (agency view)', blocked: MM2H_WAIT },
        { n: 'M3', name: 'Visa & Pass Renewals Due', blocked: MM2H_WAIT },
        { n: 'M5', name: 'Document Requests (PDPA)', blocked: MM2H_WAIT },
        { n: 'M16', name: 'Future Integrations Status', blocked: MM2H_WAIT },
      ] },
      ops(MM2H_WAIT),
      shared(),
    ],
  },
  {
    id: 'odw', product: 'On Da Way', admin: 'Admin On Da Way', androidId: 'com.jslproperties.adminodw',
    where: 'Not linked yet — the repo was not found from here',
    sections: [ops(ODW_WAIT), shared()],
  },
  {
    id: 'biz', product: 'AI Buddy Biz', admin: 'Admin Biz', androidId: 'com.jslproperties.adminbiz',
    where: 'Its own database (ai-buddy-biz repo) — not linked to this admin yet',
    sections: [
      { title: 'Businesses', items: [
        { n: 'B1', name: 'Businesses & Templates', blocked: BIZ_WAIT },
        { n: 'B2', name: 'Module Switches per Business', blocked: BIZ_WAIT },
        { n: 'B3', name: 'Team Invitations', blocked: BIZ_WAIT },
      ] },
      { title: 'Modules', items: [
        { n: 'B4', name: 'POS, Inventory & Barcodes', blocked: BIZ_WAIT },
        { n: 'B5', name: 'Invoicing, Accounting & Tax', blocked: BIZ_WAIT },
        { n: 'B6', name: 'CRM, Leads & Campaigns', blocked: BIZ_WAIT },
        { n: 'B7', name: 'Outbound Message Queue', blocked: BIZ_WAIT },
        { n: 'B8', name: 'Shipping, Cargo & Customs', blocked: BIZ_WAIT },
        { n: 'B9', name: 'HR & Payroll (EPF/SOCSO/EIS/PCB)', blocked: BIZ_WAIT },
        { n: 'B10', name: 'Legal, Contracts & E-signing', blocked: BIZ_WAIT },
        { n: 'B11', name: 'Kids Care Incidents & Medicine Logs', blocked: BIZ_WAIT },
        { n: 'B12', name: 'Restaurant, Orders & Delivery', blocked: BIZ_WAIT },
        { n: 'B13', name: 'Shopify / WooCommerce Sync', blocked: BIZ_WAIT },
        { n: 'B14', name: 'AI Agent Approved Actions', blocked: BIZ_WAIT },
      ] },
      ops(BIZ_WAIT),
      shared(),
    ],
  },
];

export const appById = (id: AppId): AdminApp => APPS.find(a => a.id === id)!;

declare const __EAB_APP__: string | undefined;
/** Which admin this build is. Anything unknown falls back to the original Admin EAB. */
export function buildApp(raw: string | undefined = typeof __EAB_APP__ !== 'undefined' ? __EAB_APP__ : undefined): BuildApp {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'all') return 'all';
  return (APPS.some(a => a.id === v) ? v : 'eab') as AppId;
}
export const COMBINED = { admin: 'Admin AI Buddy', androidId: 'com.jslproperties.adminhub' };
/** The name shown in the top bar, sign-in screen and window title. */
export const adminName = (b: BuildApp = buildApp()) => (b === 'all' ? COMBINED.admin : appById(b).admin);
/** Apps this build may show. */
export const appsFor = (b: BuildApp = buildApp()): AdminApp[] => (b === 'all' ? APPS : [appById(b)]);
