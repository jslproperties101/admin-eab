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
  | 'viewHealth' | 'viewHealthAgents' | 'recordBackupTest' | 'editHealthLimits';
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
};
export const can = (role: Role | null | undefined, a: Ability): boolean => !!role && RULES[a].includes(role);
export const ALL_ROLES: Role[] = ['owner', 'admin', 'compliance', 'viewer', 'regulator'];
