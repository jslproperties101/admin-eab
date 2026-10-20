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

export type Ability = 'search' | 'viewAgent' | 'export' | 'viewLogs' | 'manageAdmins';
const RULES: Record<Ability, Role[]> = {
  search: ['owner', 'admin', 'compliance', 'regulator'],
  viewAgent: ['owner', 'admin', 'compliance', 'regulator'],
  export: ['owner', 'compliance'],
  viewLogs: ['owner', 'compliance'],
  manageAdmins: ['owner'],
};
export const can = (role: Role | null | undefined, a: Ability): boolean => !!role && RULES[a].includes(role);
export const ALL_ROLES: Role[] = ['owner', 'admin', 'compliance', 'viewer', 'regulator'];
