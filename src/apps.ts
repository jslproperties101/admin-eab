// AdminBatch010: one admin codebase for every AI Buddy app. Each app below is an admin "space" with its own feature list.
// The same code builds:
//   - the combined admin (EAB_APP=all): sign in once, switch between apps at the top of Home;
//   - one standalone admin per app (EAB_APP=eab|pos|mm2h|odw|biz): its own name and Android package, only that app.
// Sign-in, roles, the allow-list and the two tamper-proof logs are shared by all of them (the eab_admin_* functions).
// `open` features work now. `blocked` says in plain words why a feature cannot work yet.
import { SECTIONS as EAB_SECTIONS, Section, Feature } from './screens/features';
import { Ability } from './admin/roles';
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

type App4 = 'pos' | 'odw' | 'mm2h' | 'biz';
/** One tile that opens a list from eab_admin_app_view. */
const data = (app: App4, n: string, name: string, view: string, note?: string, needs: Ability = 'appView'): Feature =>
  ({ n, name, open: { k: 'appdata', app, view, title: name }, needs, note });
const settings = (app: 'odw' | 'mm2h' | 'biz', n: string, name: string, note: string): Feature =>
  ({ n, name, open: { k: 'appsettings', app, title: name }, needs: 'appView', note });

/** Operations for an app with its own settings row (On Da Way, MM2H, Biz). */
const ops = (app: 'odw' | 'mm2h' | 'biz'): Section => ({ title: 'Operations', items: [
  data(app, 'O1', 'Users Overview', 'users', 'Who uses the app, last activity'),
  data(app, 'O2', 'Sign-ups & Active Users', 'signups', 'New users per day in the period'),
  settings(app, 'O3', 'Announcement Banner', 'Message shown at the top of the app'),
  data(app, 'O4', 'Support Tickets', 'tickets', 'Problem reports from the app', 'appTickets'),
  data(app, 'O5', 'Feature Flags', 'flags', 'Switch features on or off'),
  settings(app, 'O6', 'Maintenance Mode', 'Close the app with a message'),
  settings(app, 'O7', 'App Release Manager', 'Minimum version and update link'),
  data(app, 'O8', 'Error Logs & Crashes', 'errors', 'Errors the app reported, grouped'),
] });

const PAY_WAIT = 'Payment gateways are not in the app yet (sandbox work in progress)';

export const APPS: AdminApp[] = [
  {
    id: 'eab', product: 'Estate Agent AI Buddy', admin: 'Admin EAB', androidId: 'com.jslproperties.admineab',
    where: 'Shared database with Estate Agent AI Buddy',
    sections: EAB_SECTIONS,
  },
  {
    id: 'pos', product: 'AI Buddy POS', admin: 'Admin POS', androidId: 'com.jslproperties.adminpos',
    where: 'Accounting module inside Estate Agent AI Buddy (same database; records synced from the phone)',
    sections: [
      { title: 'Businesses', items: [
        { n: 'P1', name: 'Business Owner Records', open: SEARCH, needs: 'viewAgent', note: 'Find the owner; synced POS records show in their profile' },
        data('pos', 'P2', 'Businesses Overview', 'businesses', 'Every business using POS, record counts'),
        { n: 'P3', name: 'Module Switch per Account', open: { k: 'ops', tab: 'flags' }, needs: 'viewOps', note: 'POS is switched by Estate Agent AI Buddy feature flags' },
      ] },
      { title: 'Sales & Accounts', items: [
        data('pos', 'P4', 'Sales & POS Transactions', 'sales', 'Receipts, method, total'),
        data('pos', 'P5', 'Ledger & Journal Postings', 'journals', 'Posted, draft and reversed journals'),
        data('pos', 'P6', 'Profit & Loss', 'pnl', 'Income less expenses, per business'),
        data('pos', 'P7', 'Invoices & Receipts', 'invoices', 'Invoices, due dates, status'),
        data('pos', 'P8', 'LHDN MyInvois Status (sandbox)', 'einvoices', 'Ready, submitted, valid, invalid'),
        data('pos', 'P9', 'SST & Tax Settings', 'tax', 'Company TIN, SST and MSIC per business'),
      ] },
      { title: 'People', items: [
        data('pos', 'P10', 'Customers (CRM)', 'customers', 'Leads, stage and value'),
        data('pos', 'P11', 'Attendance', 'attendance', 'Clock-in and clock-out'),
        data('pos', 'P12', 'Payroll Runs', 'payroll', 'Payslips and gross pay per month'),
      ] },
      { title: 'Payments (test mode only)', items: [
        { n: 'P13', name: 'FPX / Stripe / Google Play Test Payments', blocked: PAY_WAIT },
        { n: 'P14', name: 'Plans & Entitlements', blocked: PAY_WAIT },
        { n: 'P15', name: 'Refunds & Disputes', blocked: PAY_WAIT },
      ] },
      // POS runs inside Estate Agent AI Buddy, so these are that app's own working screens.
      { title: 'Operations', items: [
        data('pos', 'O1', 'Users Overview', 'users', 'Who uses POS, last activity'),
        data('pos', 'O2', 'Sign-ups & Active Users', 'signups', 'First POS use per day'),
        { n: 'O3', name: 'Announcements & Push', open: { k: 'news', tab: 'push' }, needs: 'viewContent', note: 'Estate Agent AI Buddy broadcast push' },
        { n: 'O4', name: 'Support Tickets', open: { k: 'tickets' }, needs: 'viewTickets', note: 'Problem reports from the app' },
        { n: 'O5', name: 'Feature Flags', open: { k: 'ops', tab: 'flags' }, needs: 'viewOps', note: 'Switch features per group' },
        { n: 'O6', name: 'Maintenance Mode', open: { k: 'ops', tab: 'maintenance' }, needs: 'viewOps', note: 'Block the app, 3 languages' },
        { n: 'O7', name: 'App Release Manager', open: { k: 'ops', tab: 'release' }, needs: 'viewOps', note: 'Minimum version, soft / hard' },
        { n: 'O8', name: 'Error Logs & Crashes', open: { k: 'health', tab: 'errors' }, needs: 'viewHealthAgents', note: 'Problem reports and failures' },
      ] },
      shared(),
    ],
  },
  {
    id: 'mm2h', product: 'Malaysia Welcome AI Buddy (MM2H)', admin: 'Admin MM2H', androidId: 'com.jslproperties.adminmm2h',
    where: 'Families who switch on "Share with MM2H office" in the app (documents stay on the phone)',
    sections: [
      { title: 'Content the families see', items: [
        data('mm2h', 'M17', 'News Sources', 'content:news_source', 'Add, edit, publish'),
        data('mm2h', 'M18', 'Hotspots', 'content:hotspot', 'Add, edit, publish'),
        data('mm2h', 'M19', 'Coupons & Partners', 'content:coupon', 'Expired coupons hide themselves'),
        data('mm2h', 'M13', 'Services Directory', 'content:service', 'Add, edit, publish'),
        data('mm2h', 'M11', 'Local Life Guide', 'content:guide', 'Add, edit, publish'),
        data('mm2h', 'M8', 'Schools & Education List', 'content:school', 'Add, edit, publish'),
        data('mm2h', 'M9', 'Healthcare & Insurance List', 'content:healthcare', 'Add, edit, publish'),
        data('mm2h', 'M7', 'Housing Listings', 'content:housing', 'Add, edit, publish'),
        data('mm2h', 'M12', 'AI Buddy Knowledge', 'content:knowledge', 'Answers AI Buddy can give'),
        data('mm2h', 'M0', 'MM2H Rules & Figures (official refs)', 'content:rule', 'With the official link'),
      ] },
      { title: 'Families & Applications', items: [
        data('mm2h', 'M1', 'Families', 'families', 'Families sharing with the office'),
        data('mm2h', 'M2', 'Application Tracker (agency view)', 'applications', 'Stage per family'),
        data('mm2h', 'M3', 'Visa & Pass Renewals Due', 'renewals', 'Next 180 days and expired'),
        data('mm2h', 'M5', 'Document Requests (PDPA)', 'requests', 'Copy and deletion requests', 'appView'),
        data('mm2h', 'M16', 'Future Integrations Status', 'content:integration', 'Status of each planned link'),
      ] },
      ops('mm2h'),
      shared(),
    ],
  },
  {
    id: 'odw', product: 'On Da Way', admin: 'Admin On Da Way', androidId: 'com.jslproperties.adminodw',
    where: 'Shared database with Estate Agent AI Buddy (odw_* tables); read-only here',
    sections: [
      { title: 'Sales tracking', items: [
        data('odw', 'W1', 'Agents', 'agents', 'Agency, REN number, sales'),
        data('odw', 'W2', 'Sales Progress', 'sales', 'Progress %, next stage, vendor link'),
        data('odw', 'W3', 'Overdue & Attention', 'overdue', 'Late stages and waiting items'),
        data('odw', 'W4', 'Vendors & Properties', 'vendors', 'Vendors and how many properties'),
        data('odw', 'W5', 'Lawyers, Banks & Other Parties', 'parties', 'Follow-ups due'),
        data('odw', 'W6', 'Updates & Vendor Nudges', 'updates', 'Notes shown to vendors'),
        data('odw', 'W7', 'AI Questions', 'ai', 'What agents asked AI'),
      ] },
      ops('odw'),
      shared(),
    ],
  },
  {
    id: 'biz', product: 'AI Buddy Biz', admin: 'Admin Biz', androidId: 'com.jslproperties.adminbiz',
    where: 'Its own database (AI Buddy Biz project) — sign in to it once with Google',
    sections: [
      { title: 'Businesses', items: [
        data('biz', 'B1', 'Businesses & Templates', 'businesses', 'Team, outlets, modules on'),
        data('biz', 'B2', 'Module Switches per Business', 'modules', 'Switch a module on or off'),
        data('biz', 'B3', 'Team Invitations', 'invites', 'Open and accepted'),
      ] },
      { title: 'Modules', items: [
        data('biz', 'B4', 'POS, Inventory & Barcodes', 'inventory', 'Products, stock, below reorder'),
        data('biz', 'B4S', 'POS Sales', 'sales', 'Receipts and totals in the period'),
        data('biz', 'B5', 'Invoicing, Accounting & Tax', 'accounting', 'Invoices, unpaid, e-Invoice status'),
        data('biz', 'B6', 'CRM, Leads & Campaigns', 'crm', 'Deals, value, leads captured'),
        data('biz', 'B7', 'Outbound Message Queue', 'outbound', 'WhatsApp, email, SMS; failures first'),
        data('biz', 'B8', 'Shipping, Cargo & Customs', 'shipping', 'Status, customs, dangerous goods'),
        data('biz', 'B9', 'HR & Payroll (EPF/SOCSO/EIS/PCB)', 'hr', 'Payroll runs, leave and claims'),
        data('biz', 'B10', 'Legal, Contracts & E-signing', 'legal', 'Signatures, renewals, compliance due'),
        data('biz', 'B11', 'Kids Care Incidents & Medicine Logs', 'kids', 'Facts only — no child names'),
        data('biz', 'B12', 'Restaurant, Orders & Delivery', 'orders', 'Orders by channel, bookings'),
        data('biz', 'B13', 'Shopify / WooCommerce Sync', 'shopsync', 'Channels and last errors'),
        data('biz', 'B14', 'AI Agent Approved Actions', 'ai', 'Suggestions, decisions, AI cost'),
      ] },
      ops('biz'),
      { title: 'Biz admin', items: [
        data('biz', 'B17', 'Biz Admins & Roles', 'admins', 'Who may open the Biz admin', 'appAdmins'),
        data('biz', 'B18', 'Biz Admin Log', 'adminlog', 'Every view and change, hash-chained', 'appLog'),
      ] },
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
