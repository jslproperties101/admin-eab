// What each admin role may do in the app. The DATABASE enforces the same rules (eab_admin_guard); this file only decides
// what the screens show, so a hidden button is a convenience, never the protection.
export type Role = 'owner' | 'admin' | 'compliance' | 'viewer' | 'regulator';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', compliance: 'Compliance', viewer: 'Viewer', regulator: 'Regulator (temporary)',
};
export const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including adding admins and settings.',
  admin: 'Daily operations: agents, news, announcements, account actions. No exports, no logs.',
  compliance: 'Agent records, exports, regulator cases, audit and access logs. No publishing.',
  viewer: 'Read-only dashboards. No personal data, no exports.',
  regulator: 'Read-only, limited to the agents and dates of one case, until the expiry date.',
};

export type Ability = 'search' | 'viewAgent' | 'export' | 'viewLogs' | 'manageAdmins'
  | 'listAgents' | 'accountActions' | 'verifyLicence' | 'viewSettings' | 'editSettings'
  | 'viewCases' | 'editCases' | 'grantRegulator' | 'vault'
  | 'viewHealth' | 'viewHealthAgents' | 'recordBackupTest' | 'editHealthLimits'
  | 'viewDash' | 'viewDashAgents'
  | 'viewContent' | 'editContent' | 'viewTickets' | 'editTickets' | 'viewOps' | 'editOps'
  | 'pdpa' | 'complaints' | 'viewHolds' | 'placeHold' | 'licences' | 'internal' | 'viewRetention' | 'reviewRetention'
  | 'boardReport' | 'auditBundle' | 'reportBuilder' | 'reportNames'
  | 'viewBroadcasts' | 'broadcastNames' | 'editBroadcasts' | 'reports' | 'reportSchedule' | 'workspaces' | 'todo'
  | 'viewMarket' | 'viewMarketAgents'
  | 'scorecard' | 'funnel' | 'bulkActions' | 'duplicates' | 'viewDevices' | 'removeDevice'
  | 'appView' | 'appManage' | 'appTickets' | 'appRequests' | 'appLog' | 'appAdmins';
const RULES: Record<Ability, Role[]> = {
  search: ['owner', 'admin', 'compliance', 'regulator'],
  viewAgent: ['owner', 'admin', 'compliance', 'regulator'],
  export: ['owner', 'compliance'],
  viewLogs: ['owner', 'compliance'],
  manageAdmins: ['owner'],
  // AdminBatch002 — same rules as the MainForAdmin-B / AdminBatch002 database functions
  listAgents: ['owner', 'admin', 'compliance', 'regulator'],
  accountActions: ['owner', 'admin'],          // suspend / ban / close / re-activate / force logout
  verifyLicence: ['owner', 'admin', 'compliance'],
  viewSettings: ['owner', 'admin', 'compliance', 'viewer'],
  editSettings: ['owner', 'admin'],
  // AdminBatch003 — same rules as the case / vault database functions
  viewCases: ['owner', 'compliance', 'regulator'],   // a regulator sees only their own case
  editCases: ['owner', 'compliance'],
  grantRegulator: ['owner'],
  vault: ['owner', 'compliance', 'regulator'],
  // AdminBatch004 — same rules as the System Health database functions
  viewHealth: ['owner', 'admin', 'compliance', 'viewer'],       // counts and sizes only
  viewHealthAgents: ['owner', 'admin', 'compliance'],           // lists that name agents (sync failures, problem reports)
  recordBackupTest: ['owner', 'admin', 'compliance'],
  editHealthLimits: ['owner', 'admin'],
  // AdminBatch005 — same rules as the eab_admin_dash_* database functions
  viewDash: ['owner', 'admin', 'compliance', 'viewer'],         // totals and charts
  viewDashAgents: ['owner', 'admin', 'compliance'],             // lists that name agents (inactive, at-risk, per version, events, stale)
  // AdminBatch006 — same rules as the MainForAdmin-D and AdminBatch006 database functions
  viewContent: ['owner', 'admin', 'compliance', 'viewer'],      // posts, groups, codes, push counts
  editContent: ['owner', 'admin'],                               // write / publish / withdraw / order / codes / send push / upload files
  viewTickets: ['owner', 'admin', 'compliance'],                 // problem reports name agents
  editTickets: ['owner', 'admin'],                               // status and internal notes
  viewOps: ['owner', 'admin', 'compliance', 'viewer'],           // maintenance, minimum version, feature flags
  editOps: ['owner', 'admin'],
  // AdminBatch007 — same rules as the compliance database functions
  pdpa: ['owner', 'compliance'],                                 // PDPA requests (view and write)
  complaints: ['owner', 'admin', 'compliance'],
  viewHolds: ['owner', 'admin', 'compliance'],
  placeHold: ['owner', 'compliance'],                            // place / release a legal hold
  licences: ['owner', 'admin', 'compliance'],                    // licence expiry list and dates
  internal: ['owner', 'admin', 'compliance'],                    // internal tags and notes on agents
  viewRetention: ['owner', 'compliance'],
  reviewRetention: ['owner'],
  // AdminBatch008 — same rules as the report database functions
  boardReport: ['owner', 'compliance'],                          // monthly Board report (kept in the vault)
  auditBundle: ['owner', 'compliance'],                          // annual audit bundle (kept in the vault)
  reportBuilder: ['owner', 'admin', 'compliance', 'viewer'],     // custom reports; Viewer: grouped totals only
  reportNames: ['owner', 'admin', 'compliance'],                 // report columns that name people (names, emails)
  // AdminBatch008 — same rules as the broadcast / report / workspace / to-do database functions
  viewBroadcasts: ['owner', 'admin', 'compliance', 'viewer'],   // list and counts, no names
  broadcastNames: ['owner', 'admin', 'compliance'],             // who got it (names, email, phone)
  editBroadcasts: ['owner', 'admin'],                            // write, queue, send, cancel, tap-to-send
  reports: ['owner', 'compliance'],                              // weekly report list, download, make now
  reportSchedule: ['owner'],                                     // switch on / off, day, hour, who gets it
  workspaces: ['owner', 'admin', 'compliance'],
  todo: ['owner', 'admin', 'compliance', 'viewer'],              // own items; a Viewer cannot share or change shared ones
  // AdminBatch009 — same rules as the eab_admin_market_* database functions
  viewMarket: ['owner', 'admin', 'compliance', 'viewer'],        // totals and charts
  viewMarketAgents: ['owner', 'admin', 'compliance'],            // lists that name agents (needs work, deals, stuck, commission by agent)
  // AdminBatch009 — same rules as the agent-insight database functions
  scorecard: ['owner', 'admin', 'compliance', 'viewer'],         // Viewer: how scores are spread, no names
  funnel: ['owner', 'admin', 'compliance', 'viewer'],            // Viewer: counts only; "who is stuck" = viewDashAgents
  bulkActions: ['owner', 'admin'],                               // suspend / re-activate / sign out / tag / message many agents
  duplicates: ['owner', 'admin', 'compliance'],
  viewDevices: ['owner', 'admin', 'compliance', 'regulator'],    // a regulator only for agents in their case
  removeDevice: ['owner', 'admin'],                              // sign one phone out (MainForAdmin-G)
  // AdminBatch010 — same rules as the eab_admin_app_* functions (Admin EAB and AI Buddy Biz databases)
  appView: ['owner', 'admin', 'compliance', 'viewer'],           // Viewer: totals only, lists without names
  appManage: ['owner', 'admin'],                                 // maintenance, release, banner, flags, content, modules
  appTickets: ['owner', 'admin', 'compliance'],
  appRequests: ['owner', 'compliance'],                          // MM2H data copy / deletion requests (PDPA)
  appLog: ['owner', 'compliance'],                               // the Biz database's own admin log
  appAdmins: ['owner'],                                          // who may open the Biz admin
};
export const can = (role: Role | null | undefined, a: Ability): boolean => !!role && RULES[a].includes(role);
export const ALL_ROLES: Role[] = ['owner', 'admin', 'compliance', 'viewer', 'regulator'];
