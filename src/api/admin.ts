// Typed calls to the eab_admin_* database functions (supabase/migrations/20261021000000_admin_eab_foundation.sql in the
// estate-agent-buddy repo). Every call passes a short device description for the access log.
import { Role } from '../admin/roles';

export interface Me { user_id: string; email: string; role: Role; expires_at: string | null }
export interface SearchHit {
  kind: 'agent' | 'record'; user_id: string; email: string; name?: string | null; label: string;
  collection?: string; record_id?: string; workspace_id?: string; deleted?: boolean; sub?: string;
}
export interface AgentProfile {
  user_id: string; email: string; name: string | null; joined_at: string; last_sign_in_at: string | null;
  banned_until: string | null; deleted_at: string | null; status: 'active' | 'banned' | 'closed'; licence: string | null;
  workspaces: { id: string; name: string; role: string }[];
  counts: Record<string, { total: number; deleted: number }>;
}
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

export type Call = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>;

export const api = (call: Call, device: string) => ({
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
  setAdmin: (email: string, role: Role, active: boolean, expiresAt: string | null, reason: string) =>
    call<AdminRow>('eab_admin_set_admin', { p_email: email, p_role: role, p_active: active, p_expires_at: expiresAt, p_reason: reason, p_device: device }),
});
export type Api = ReturnType<typeof api>;
