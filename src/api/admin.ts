// Typed calls to the eab_admin_* database functions (supabase/migrations/20261021000000_admin_eab_foundation.sql in the
// estate-agent-buddy repo). Every call passes a short device description for the access log.
import { Role } from '../admin/roles';

export interface Me { user_id: string; email: string; role: Role; expires_at: string | null }
export interface SearchHit {
  kind: 'agent' | 'record'; user_id: string; email: string; name?: string | null; label: string;
  collection?: string; record_id?: string; workspace_id?: string; deleted?: boolean; sub?: string;
}
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'closed';
export interface LicenceDetail { type: string | null; number: string; verified: boolean; verified_at: string | null }
export interface LastLogin { at: string; event?: string; platform: string | null; app_version: string | null }
export interface AgentProfile {
  user_id: string; email: string; name: string | null; joined_at: string; last_sign_in_at: string | null;
  banned_until: string | null; deleted_at: string | null; status: AccountStatus;
  /** One line, e.g. "REN 12345 (verified)"; null = not provided. Parts are in licence_detail (MainForAdmin-B). */
  licence: string | null;
  status_reason?: string | null; force_logout_after?: string | null;
  licence_detail?: LicenceDetail | null;
  terms?: { version: string | null; at: string } | null;
  marketing?: boolean | null;
  last_login?: LastLogin | null;
  workspaces: { id: string; name: string; role: string }[];
  counts: Record<string, { total: number; deleted: number }>;
}
/** One row of the all-agents list (eab_admin_agents, AdminBatch002). */
export interface AgentRow {
  user_id: string; email: string; name: string | null; joined_at: string; status: AccountStatus;
  status_reason: string | null; status_changed_at: string | null; force_logout_after: string | null;
  licence: LicenceDetail | null; last_login: LastLogin | null;
  failed_30d: number; lockouts_30d: number; blocked_30d: number; terms_version: string | null; records: number;
}
export type AgentFilter = 'all' | 'not_active' | 'licence' | 'security';
/** eab_login_log row (MainForAdmin-B): kept 7 years, never changed. */
export interface LoginRow {
  seq: number; happened_at: string; received_at: string; event: string; device_id: string | null; device: string | null;
  platform: string | null; app_version: string | null; lat: number | null; lng: number | null; acc: number | null; detail: string | null;
}
export interface TermsRow { seq: number; at: string; kind: 'terms' | 'marketing'; terms_version: string | null; accepted: boolean; device_id: string | null }
export interface Settings { company_name: string; support_email: string | null; business_address: string | null; updated_at: string; updated_by: string | null }
export interface AgentRecord {
  workspace_id: string; collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean;
  rev: number; written_at: string | null; written_by: string | null;
}
export interface Version { rev: number; data: Record<string, unknown> | null; deleted: boolean; saved_by: string | null; saved_at: string | null; current: boolean }
export interface ActionRow {
  seq: number; at: string; admin_user: string; admin_email: string | null; admin_role: string | null; action: string;
  target_user: string | null; target_ref: string | null; reason: string | null; before: unknown; after: unknown; device: string | null; hash: string;
}
export interface AccessRow {
  seq: number; at: string; admin_user: string; admin_email: string | null; admin_role: string | null; kind: string;
  target_user: string | null; target_ref: string | null; detail: Record<string, unknown> | null; device: string | null; hash: string;
}
export interface ChainCheck { ok: boolean; checked: number; first_bad_seq: number | null }
export interface AdminRow { user_id: string; email: string; role: Role; active: boolean; expires_at: string | null; added_at: string; added_by: string | null }

// ---------- AdminBatch003: case files and the Document Vault ----------
export type RequesterType = 'jpph' | 'police' | 'court' | 'board' | 'pdpa' | 'other';
export type CaseStatus = 'open' | 'supplied' | 'closed';
export interface CaseAgent { user_id: string; email: string; name: string | null; date_from: string | null; date_to: string | null; added_at: string; removed_at: string | null }
export interface CaseGrant { admin_user: string; email: string; expires_at: string; granted_at: string; active: boolean }
export interface Pack {
  id: string; case_id: string | null; agent_user: string | null; reference: string; kind: 'case_pack' | 'agent_profile' | 'pdpa_access';
  format: 'pdf' | 'xlsx'; file_name: string; sha256: string; content_sha256: string | null; bytes: number; stored: boolean;
  created_by: string; created_at: string; case_no?: string | null; agent_email?: string | null; created_by_email?: string | null;
}
export interface CaseFile {
  id: string; case_no: string; requester_type: RequesterType; requester_name: string; requester_ref: string | null; requester_contact: string | null;
  received_on: string; deadline: string | null; description: string; status: CaseStatus; outcome: string | null;
  created_by: string; created_at: string; updated_at: string; closed_at: string | null;
  agents: CaseAgent[] | number; packs: Pack[] | number; grants?: CaseGrant[];
}
export interface NewCase { requester_type: RequesterType; requester_name: string; requester_ref?: string; requester_contact?: string; received_on: string; deadline?: string; description: string }
export interface Files { upload: (path: string, blob: Blob) => Promise<void>; download: (path: string) => Promise<Blob> }

export type Call = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>;

export const api = (call: Call, device: string, files: Files = { upload: async () => { throw new Error('no storage'); }, download: async () => { throw new Error('no storage'); } }) => ({
  me: () => call<Me | null>('eab_admin_me'),
  signedIn: () => call<Me>('eab_admin_signed_in', { p_device: device }),
  search: (q: string) => call<SearchHit[]>('eab_admin_search', { p_q: q, p_device: device }),
  agent: (id: string) => call<AgentProfile>('eab_admin_agent', { p_user: id, p_device: device }),
  records: (id: string, collection: string, includeDeleted = true, limit = 200, offset = 0) =>
    call<AgentRecord[]>('eab_admin_agent_records', { p_user: id, p_collection: collection, p_include_deleted: includeDeleted, p_limit: limit, p_offset: offset, p_device: device }),
  history: (ws: string, collection: string, record: string) =>
    call<Version[]>('eab_admin_record_history', { p_workspace: ws, p_collection: collection, p_record: record, p_device: device }),
  startExport: (kind: string, format: 'pdf' | 'xlsx', target: string | null, detail: Record<string, unknown> = {}) =>
    call<{ reference: string; at: string }>('eab_admin_export', { p_kind: kind, p_format: format, p_target: target, p_detail: detail, p_device: device }),
  log: (which: 'actions' | 'access', target: string | null = null, limit = 100, beforeSeq: number | null = null) =>
    call<(ActionRow | AccessRow)[]>('eab_admin_list_log', { p_log: which, p_target: target, p_limit: limit, p_before_seq: beforeSeq, p_device: device }),
  verify: () => call<{ actions: ChainCheck; access: ChainCheck }>('eab_admin_verify_chain', { p_device: device }),
  admins: () => call<AdminRow[]>('eab_admin_list_admins'),
  // AdminBatch002 (MainForAdmin-B functions + eab_admin_agents / eab_admin_settings)
  agents: (filter: AgentFilter = 'all', q: string | null = null, limit = 100, offset = 0) =>
    call<AgentRow[]>('eab_admin_agents', { p_filter: filter, p_q: q, p_limit: limit, p_offset: offset, p_device: device }),
  loginLog: (id: string, limit = 200) => call<LoginRow[]>('eab_admin_login_log', { p_user: id, p_limit: limit, p_device: device }),
  termsLog: (id: string) => call<TermsRow[]>('eab_admin_terms_log', { p_user: id, p_device: device }),
  setStatus: (id: string, status: AccountStatus, reason: string, forceLogout = false) =>
    call<unknown>('eab_admin_set_account_status', { p_user: id, p_status: status, p_reason: reason, p_force_logout: forceLogout, p_device: device }),
  forceLogout: (id: string, reason: string) => call<unknown>('eab_admin_force_logout', { p_user: id, p_reason: reason, p_device: device }),
  verifyLicence: (id: string, verified: boolean, reason: string) =>
    call<unknown>('eab_admin_verify_licence', { p_user: id, p_verified: verified, p_reason: reason, p_device: device }),
  settings: () => call<Settings>('eab_admin_settings'),
  // AdminBatch003
  cases: (status: CaseStatus | null = null, q: string | null = null) => call<CaseFile[]>('eab_admin_cases', { p_status: status, p_q: q, p_device: device }),
  caseGet: (id: string) => call<CaseFile>('eab_admin_case', { p_case: id, p_device: device }),
  caseCreate: (p: NewCase) => call<CaseFile>('eab_admin_case_create', { p, p_device: device }),
  caseUpdate: (id: string, p: Partial<Pick<CaseFile, 'status' | 'outcome' | 'deadline' | 'description' | 'requester_ref'>>, reason: string) =>
    call<CaseFile>('eab_admin_case_update', { p_case: id, p, p_reason: reason, p_device: device }),
  caseAddAgent: (id: string, agent: string, from: string | null, to: string | null, reason: string) =>
    call<CaseFile>('eab_admin_case_add_agent', { p_case: id, p_agent: agent, p_from: from, p_to: to, p_reason: reason, p_device: device }),
  caseRemoveAgent: (id: string, agent: string, reason: string) =>
    call<CaseFile>('eab_admin_case_remove_agent', { p_case: id, p_agent: agent, p_reason: reason, p_device: device }),
  caseGrant: (id: string, email: string, expiresAt: string, reason: string) =>
    call<CaseFile>('eab_admin_case_grant', { p_case: id, p_email: email, p_expires_at: expiresAt, p_reason: reason, p_device: device }),
  caseRevoke: (id: string, admin: string, reason: string) =>
    call<CaseFile>('eab_admin_case_revoke', { p_case: id, p_admin: admin, p_reason: reason, p_device: device }),
  packRegister: (p: Omit<Pack, 'id' | 'stored' | 'created_by' | 'created_at'>) => call<Pack>('eab_admin_pack_register', { p, p_device: device }),
  packStored: (id: string) => call<Pack>('eab_admin_pack_stored', { p_pack: id }),
  vault: (caseId: string | null = null, agent: string | null = null) => call<Pack[]>('eab_admin_vault', { p_case: caseId, p_agent: agent, p_device: device }),
  packDownload: (id: string) => call<{ path: string; file_name: string; format: 'pdf' | 'xlsx'; sha256: string }>('eab_admin_pack_download', { p_pack: id, p_device: device }),
  checkFile: (sha: string) => call<Pack | null>('eab_admin_check_file', { p_sha256: sha, p_device: device }),
  files,
  setSettings: (patch: Partial<Pick<Settings, 'company_name' | 'support_email' | 'business_address'>>, reason: string) =>
    call<Settings>('eab_admin_set_settings', { p_patch: patch, p_reason: reason, p_device: device }),
  setAdmin: (email: string, role: Role, active: boolean, expiresAt: string | null, reason: string) =>
    call<AdminRow>('eab_admin_set_admin', { p_email: email, p_role: role, p_active: active, p_expires_at: expiresAt, p_reason: reason, p_device: device }),
});
export type Api = ReturnType<typeof api>;
