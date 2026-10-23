// Typed calls to the eab_admin_* database functions (supabase/migrations/20261021000000_admin_eab_foundation.sql in the
// estate-agent-buddy repo). Every call passes a short device description for the access log.
import { Role } from '../admin/roles';
import { BroadcastSendResult, PushSendItem } from './session';
export type { BroadcastSendResult, PushSendItem };

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
  id: string; case_id: string | null; agent_user: string | null; reference: string; kind: 'case_pack' | 'agent_profile' | 'pdpa_access' | 'board_report' | 'audit_bundle';
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
export interface Files {
  upload: (path: string, blob: Blob) => Promise<void>; download: (path: string) => Promise<Blob>;
  /** AdminBatch006: post picture / PDF into the public folder; returns the public link. */
  media?: (path: string, blob: Blob) => Promise<string>;
  /** AdminBatch006: a problem report's screenshot. */
  screenshot?: (path: string) => Promise<Blob>;
  /** AdminBatch006: send waiting push alerts (one post, or all when null). */
  sendPush?: (itemId: string | null) => Promise<PushSendItem[]>;
  /** AdminBatch008: deliver a queued broadcast (server function send-broadcast). */
  sendBroadcast?: (id: string) => Promise<BroadcastSendResult>;
  /** AdminBatch008: make the weekly report now (server function weekly-report). */
  runReport?: (reason: string) => Promise<{ run?: ReportRun; error?: string }>;
}

// ---------- AdminBatch004: System Health ----------
export interface HealthLimits { db_limit_mb: number; storage_limit_mb: number; aws_backup: 'not_set_up' | 'set_up'; aws_note: string | null; updated_at: string; updated_by: string | null }
export interface TableHealth {
  name: string; total_bytes: number; data_bytes: number; rows: number; dead_rows: number;
  last_vacuum: string | null; last_analyze: string | null; seq_scans: number; index_scans: number;
}
export interface DbHealth {
  checked_at: string; db_bytes: number; postgres: string;
  connections: { total: number; active: number; idle: number; idle_in_transaction: number; max: number };
  longest_query_s: number; slow_queries: number;
  stats: { cache_hit_pct: number | null; commits: number; rollbacks: number; deadlocks: number; temp_bytes: number; since: string | null } | null;
  tables: TableHealth[]; limits: HealthLimits;
}
export type BackupTarget = 'supabase' | 'aws' | 'other';
export type BackupKind = 'restore_test' | 'backup_check';
export type BackupResult = 'pass' | 'partial' | 'fail';
export interface BackupTest {
  id: string; ref: string; tested_on: string; target: BackupTarget; kind: BackupKind; result: BackupResult; what: string;
  duration_minutes: number | null; notes: string | null; recorded_by: string; recorded_by_email: string | null; recorded_at: string;
}
export interface NewBackupTest { tested_on: string; target: BackupTarget; kind: BackupKind; result: BackupResult; what: string; duration_minutes?: number | null; notes?: string }
export interface StorageHealth {
  checked_at: string;
  today: { day: string; db_bytes: number; storage_bytes: number; storage_files: number };
  buckets: { bucket: string; files: number; bytes: number; first_at: string | null; last_at: string | null }[];
  uploads: { day: string; files: number; bytes: number }[];
  daily: { day: string; db_bytes: number; storage_bytes: number; storage_files: number }[];
  limits: HealthLimits;
  backup_tests: { count: number; last: BackupTest | null; last_restore_pass: BackupTest | null };
}
export interface SyncAgent {
  user_id: string; email: string; name: string | null; runs: number; fails: number; last_run: string; last_fail: string | null; last_ok: string | null;
  pending: number | null; local_bytes: number | null; app_version: string | null; platform: string | null; phones: number;
}
export interface SyncHealth {
  days: number; checked_at: string;
  totals: { runs: number; fails: number; agents: number; agents_failing: number };
  by_day: { day: string; runs: number; fails: number }[];
  agents: SyncAgent[];
}
export interface PushBroadcast {
  item_id: string; title: string | null; status: 'queued' | 'sending' | 'done'; queued_at: string; finished_at: string | null;
  targeted: number | null; sent: number | null; failed: number | null; no_phone: number | null; received: number; opened: number;
  errors: Record<string, number>;
}
export interface PushHealth {
  checked_at: string; agents: number; agents_with_phone: number;
  phones: { platform: string; phones: number; agents: number }[];
  broadcasts: PushBroadcast[]; other_pushes_30d: Record<string, number>;
}
export interface Performance {
  days: number; checked_at: string;
  startup: { app_version: string; platform: string; opens: number; avg_ms: number; p50_ms: number; p90_ms: number; max_ms: number }[];
  startup_all: { opens: number; avg_ms: number | null; p50_ms: number | null; p90_ms: number | null };
  sessions_by_day: { day: string; sessions: number; agents: number }[];
  versions: { app_version: string; agents: number }[];
  google_calls: { calls: number; failed: number };
}
export type ReportStatus = 'new' | 'seen' | 'fixed' | 'closed';
export interface ProblemReport {
  id: string; user_id: string; email: string | null; description: string; has_screenshot: boolean; app_version: string | null;
  platform: string | null; language: string | null; screen: string | null; status: ReportStatus; created_at: string;
}
export interface ErrorReports {
  checked_at: string; counts: Partial<Record<ReportStatus, number>>; reports: ProblemReport[];
  failures_7d: { kind: string; name: string; failed: number; total: number; agents: number; last_at: string | null }[];
}

// ---------- AdminBatch005: Dashboards (eab_admin_dash_*) ----------
export type Bucket = 'day' | 'week' | 'month';
export interface DashGrowth { from: string; to: string; bucket: Bucket; total: number; before: number; new: number; buckets: { start: string; new: number; running: number }[] }
export interface DashActiveDay { day: string; dau: number; wau: number; mau: number }
export interface DashActive {
  from: string; to: string; agents: number; active_in_range: number; avg_dau: number | null; avg_wau: number | null; avg_mau: number | null;
  stickiness_pct: number | null; last: DashActiveDay | null; by_day: DashActiveDay[];
}
export interface AtRiskAgent { user_id: string; email: string; name: string | null; last_day: string; days_since: number; recent_days: number; prior_days: number; reason: 'no_activity_14d' | 'activity_halved' }
export interface DashRetention {
  from: string; to: string; joined: number; names_hidden: boolean;
  retention: { days: 7 | 30 | 90; eligible: number; kept: number; pct: number | null }[];
  cohorts: { month: string; joined: number; kept7: number; eligible7: number; kept30: number; eligible30: number; kept90: number; eligible90: number }[];
  at_risk: { count: number; agents: AtRiskAgent[] | null };
}
export interface InactiveAgent {
  user_id: string; email: string; name: string | null; joined: string; last_open: string | null; last_sign_in: string | null; last_seen: string | null;
  days_since: number; app_version: string | null; platform: string | null; status: AccountStatus | null;
}
export interface DashInactive { days: 30 | 60 | 90; checked_at: string; agents: number; counts: Record<'30' | '60' | '90', number>; never_opened: number; names_hidden: boolean; list: InactiveAgent[] | null }
export interface DashDevices {
  from: string; to: string; agents: number;
  versions: { app_version: string; agents: number; last_seen: string }[];
  platforms: { platform: string; agents: number }[];
  devices: { device: string; platform: string; agents: number }[];
  languages: { language: string; agents: number }[];
  language_events: Record<string, number>;
  version_agents: { user_id: string; email: string; name: string | null; platform: string; device: string; last_seen: string }[] | null;
}
export interface PipelineStage { stage: string; listings: number; parts?: Record<string, number> }
export interface StaleListing {
  user_id: string; email: string | null; name: string | null; id: string; ref: string | null; headline: string | null; type: string | null;
  state: string | null; city: string | null; updated_at: string; days: number;
}
export interface DashListings {
  from: string; to: string; stale_days: number; checked_at: string; total: number; deleted: number; agents_with_listings: number;
  by_status: Record<string, number>; by_purpose: Record<string, number>;
  by_type: { type: string; listings: number }[]; by_state: { state: string; listings: number }[];
  new_by_month: { month: string; new: number }[];
  pipeline: { sale: PipelineStage[]; rent: PipelineStage[] };
  stale_count: number; names_hidden: boolean; stale: StaleListing[] | null;
}
export interface DashUsage {
  from: string; to: string; detail_from: string;
  ranking: { kind: string; name: string; events: number; agents: number; failures: number }[];
  not_used: { kind: string; name: string }[];
  heatmap: { dow: number; hour: number; events: number }[];
  by_day: { day: string; events: number; agents: number }[];
}
export interface UsageEvent {
  at: string; user_id: string; email: string | null; name: string | null; screen: string | null; ok: boolean; n: number | null; value: number | null;
  app_version: string | null; platform: string | null; device: string | null;
}
export interface DashEvents { kind: string; name: string; from: string; to: string; total: number; events: UsageEvent[] }

// ---------- AdminBatch009: Listings & market (eab_admin_market_*) ----------
export interface AgentRef { user_id: string; email: string | null; name: string | null }
export interface WeakListing extends AgentRef {
  id: string; ref: string | null; headline: string | null; type: string | null; state: string | null; city: string | null; status: string;
  score: number; photos: number; missing: string[]; updated_at: string;
}
export interface MarketQuality {
  listings: number; average: number | null; bands: { good: number; fair: number; poor: number }; missing: Record<string, number>;
  by_state: { state: string; listings: number; average: number }[]; below: number; weak_count: number; names_hidden: boolean; weak: WeakListing[] | null;
}
export interface DomRow { open: number; median: number | null; average: number | null; oldest: number | null; closed: number; closed_median: number | null }
export interface MarketDom {
  from: string; to: string; no_date: number;
  open: { listings: number; median: number | null; average: number | null; buckets: { under_30: number; d30_89: number; d90_179: number; d180_plus: number } };
  closed: { listings: number; median: number | null };
  by_state: (DomRow & { state: string })[]; by_city: (DomRow & { state: string; city: string })[]; by_type: (DomRow & { type: string })[];
}
export interface PriceGroup { deals: number; average_pct: number | null; median_pct: number | null }
export interface PricedDeal extends AgentRef {
  deal_id: string; date: string; side: string; ref: string | null; headline: string | null; type: string | null; state: string | null; city: string | null;
  asking: number; final: number; pct: number;
}
export interface MarketPrice {
  from: string; to: string; deals: number; compared: number; not_linked: number; no_price: number; average_pct: number | null; median_pct: number | null;
  below: number; at: number; above: number;
  by_side: (PriceGroup & { side: string })[]; by_state: (PriceGroup & { state: string })[]; by_type: (PriceGroup & { type: string })[];
  names_hidden: boolean; list: PricedDeal[] | null;
}
export interface AreaRow { state: string; on_market: number; new: number; closed: number; enquiries: number; per_listing: number | null }
export interface MarketAreas {
  from: string; to: string; on_market: number; new: number; closed: number; enquiries: number; enquiries_unlinked: number;
  by_state: AreaRow[]; by_city: (AreaRow & { city: string; supply_level: number; demand_level: number })[];
}
export interface StuckListing extends AgentRef {
  id: string; ref: string | null; headline: string | null; type: string | null; state: string | null; city: string | null; stage: string;
  asking: number | null; updated_at: string; days: number;
}
export interface MarketStuck {
  days: number; booked: number; stuck_count: number; by_stage: { stage: string; booked: number; stuck: number; oldest: number | null }[];
  names_hidden: boolean; list: StuckListing[] | null;
}
export interface MarketCommission {
  from: string; to: string;
  open: { deals: number; value: number; commission: number; agents_share: number; estimated: number; confirmed: number; overdue: number; no_date: number };
  received: { deals: number; commission: number; agents_share: number };
  by_month: { month: string; deals: number; estimated: number; confirmed: number; commission: number }[];
  by_side: { side: string; deals: number; value: number; commission: number }[];
  by_stage: { stage: string; deals: number; commission: number }[];
  names_hidden: boolean; agents: (AgentRef & { deals: number; commission: number; agents_share: number; next_date: string | null })[] | null;
}
export interface MarketProjects {
  from: string; to: string; projects: number; reached: number; opened: number; redeemed: number;
  list: { id: string; title: string; developer: string | null; status: string; published_at: string; expires_at: string | null; audience: string;
    reached: number; opened: number; open_pct: number | null; redeemed: number; codes: number }[];
  by_day: { day: string; opened: number; redeemed: number }[];
}
export interface MarketNews {
  from: string; to: string; posts: number; reached: number; opened: number; open_pct: number | null;
  with_alert: { posts: number; open_pct: number | null }; without_alert: { posts: number; open_pct: number | null };
  list: { id: string; title: string; published_at: string; audience: string; push_alert: boolean; reached: number; opened: number; open_pct: number | null; median_hours: number | null }[];
  by_language: { language: string; reached: number; opened: number; open_pct: number | null }[];
  by_group: { group_id: string; group: string; priority: number; reached: number; opened: number; open_pct: number | null }[];
  heatmap: { dow: number; hour: number; events: number }[];
  best: { dow: number; hour: number; opens: number }[];
}

// ---------- AdminBatch006: news (MainForAdmin-D functions), tickets, flags, overview ----------
export type FeedKind = 'news' | 'project' | 'announcement';
export type FeedStatus = 'draft' | 'published' | 'withdrawn';
export type Audience = 'all' | 'groups' | 'codes';
export interface ProjectInfo { developer?: string; location?: string; price_from?: number | null; price_to?: number | null; launch?: string; status?: string }
export interface FeedItem {
  id: string; kind: FeedKind; title_en: string; title_bm: string | null; title_zh: string | null;
  body_en: string | null; body_bm: string | null; body_zh: string | null;
  image_url: string | null; link_url: string | null; pdf_url: string | null; push_alert: boolean;
  display: 'banner' | 'popup' | null; project: ProjectInfo | null; audience: Audience; status: FeedStatus;
  published_at: string | null; expires_at: string | null; created_by: string | null; created_at: string; updated_at: string;
  group_ids: string[]; opened?: number; acknowledged?: number; dismissed?: number; code_grants?: number;
}
export type FeedDraft = Partial<Omit<FeedItem, 'created_by' | 'created_at' | 'updated_at' | 'opened' | 'acknowledged' | 'dismissed' | 'code_grants' | 'status' | 'published_at'>> & { kind: FeedKind; title_en: string };
export interface GroupFilters {
  user_ids?: string[]; emails?: string[]; countries?: string[]; licence_types?: string[]; languages?: string[]; platforms?: string[]; app_versions?: string[];
  joined_from?: string; joined_to?: string; last_login_from?: string; last_login_to?: string; min_logins?: number;
}
export interface AudienceGroup { id: string; name: string; filters: GroupFilters; priority: number; active: boolean; created_at: string; updated_at: string; agents?: number }
export const EVERYONE = '00000000-0000-0000-0000-000000000000';
export interface InviteCode { code: string; label: string | null; item_ids: string[]; active: boolean; expires_at: string | null; max_uses: number | null; uses: number; created_at: string; agents: number }
export interface CodeGrant { user_id: string; email: string; name: string | null; item_id: string; title: string | null; granted_at: string }
export interface PushReport {
  item_id: string; status: 'queued' | 'sending' | 'done'; queued_at: string; started_at: string | null; finished_at: string | null;
  targeted: number | null; sent: number | null; failed: number | null; no_phone: number | null; delivered: number; opened: number;
  kind?: FeedKind; title_en?: string;
}
export type TicketStatus = 'new' | 'seen' | 'fixed' | 'closed';
export interface TicketRow {
  id: string; user_id: string; email: string | null; name: string | null; description: string; has_screenshot: boolean;
  app_version: string | null; platform: string | null; language: string | null; screen: string | null; status: TicketStatus;
  created_at: string; notes: number; last_activity: string;
}
export interface TicketNote { id: number; report_id: string; kind: 'note' | 'status'; body: string | null; from_status: TicketStatus | null; to_status: TicketStatus | null; by_user: string; by_email: string | null; at: string }
export interface Ticket extends Omit<TicketRow, 'has_screenshot' | 'notes' | 'last_activity'> { screenshot_path: string | null; history: TicketNote[] }
export interface FeatureFlag { key: string; label: string; description: string | null; enabled: boolean; audience: 'all' | 'groups'; group_ids: string[]; created_at: string; updated_at: string; updated_by: string | null }
export interface MasterDash {
  checked_at: string; today: string; agents: number; new_7d: number; active_today: number; active_7d: number; active_30d: number; at_risk: number; live_now: number;
  listings: number; stale: number; closed_30d: number; db_bytes: number; db_limit_bytes: number; files_bytes: number; files_limit_bytes: number;
  aws_backup: 'not_set_up' | 'set_up'; last_restore_pass: string | null; sync_runs_7d: number; sync_fails_7d: number;
  tickets_new: number; tickets_open: number; pushes_waiting: number; posts_live: number; maintenance_on: boolean; maintenance_back_at: string | null;
  min_version: string | null; min_version_mode: 'soft' | 'hard' | null; flags_on: number; licences_unverified: number; accounts_not_active: number;
  licences_expired?: number; licences_expiring_30?: number; pdpa_active?: number; pdpa_due_soon?: number; complaints_active?: number; holds_active?: number;
  active_by_day: { day: string; agents: number }[];
}
export interface TopAgent { user_id: string; email: string; name: string | null; listings: number; new_listings: number; sold: number; rented: number; closed: number; active_days: number; actions: number }
export interface LiveUsers {
  minutes: number; checked_at: string; count: number; names_hidden: boolean; by_screen: { screen: string; agents: number }[];
  agents: { user_id: string; email: string; name: string | null; last_at: string; screen: string | null; app_version: string | null; platform: string | null; device: string | null }[] | null;
}
export interface OpsSettings extends Settings {
  min_version: string | null; min_version_mode: 'soft' | 'hard'; update_url: string | null; maintenance_on: boolean;
  maintenance_message_en: string | null; maintenance_message_bm: string | null; maintenance_message_zh: string | null; maintenance_back_at: string | null;
}

// ---------- AdminBatch007: compliance core ----------
export type PdpaKind = 'access' | 'correction' | 'deletion' | 'withdraw_consent' | 'other';
export type PdpaStatus = 'open' | 'in_progress' | 'done' | 'refused';
export interface CaseEvent { id: number; kind: 'created' | 'status' | 'updated' | 'note'; body: string | null; from_status: string | null; to_status: string | null; by_user: string; by_email: string | null; at: string }
export interface PdpaRequest {
  id: string; ref: string; agent_user: string | null; requester_name: string; requester_contact: string | null; received_on: string; kind: PdpaKind;
  details?: string; summary?: string; status: PdpaStatus; decision: string | null; decided_on: string | null; supplied_on: string | null; outcome: string | null;
  case_id: string | null; case_no?: string | null; created_by: string; created_at: string; updated_at: string;
  agent_email: string | null; agent_name?: string | null; agent_on_hold: boolean; days_open: number | null; history?: CaseEvent[];
}
export interface NewPdpa { agent_user?: string | null; requester_name: string; requester_contact?: string; received_on: string; kind: PdpaKind; details: string; case_id?: string | null }
export type ComplaintStatus = 'open' | 'investigating' | 'resolved' | 'dismissed' | 'referred';
export type ComplaintChannel = 'phone' | 'email' | 'walk_in' | 'board' | 'other';
export type ComplaintCategory = 'misleading_listing' | 'conduct' | 'fees' | 'privacy' | 'other';
export interface Complaint {
  id: string; ref: string; agent_user: string | null; complainant_name: string; complainant_contact: string | null; received_on: string;
  channel: ComplaintChannel; category: ComplaintCategory; listing_ref: string | null; details?: string; summary?: string; status: ComplaintStatus;
  outcome: string | null; case_id: string | null; case_no?: string | null; created_by: string; created_at: string; updated_at: string;
  agent_email: string | null; agent_name: string | null; agent_complaints?: number; history?: CaseEvent[];
}
export interface NewComplaint { agent_user?: string | null; complainant_name: string; complainant_contact?: string; received_on: string; channel: ComplaintChannel; category: ComplaintCategory; listing_ref?: string; details: string; case_id?: string | null }
export interface LegalHold {
  id: string; agent_user: string; reason: string; case_id: string | null; placed_by: string; placed_by_email: string | null; placed_at: string;
  released_by: string | null; released_by_email: string | null; released_at: string | null; release_reason: string | null;
  agent_email?: string; agent_name?: string | null; case_no?: string | null;
}
export interface LicenceExpiryRow { user_id: string; email: string; name: string | null; type: string | null; number: string; verified: boolean; expires_on: string | null; days_left: number | null }
export interface LicenceExpiry { today: string; within: number; counts: { expired: number; in_7: number; in_30: number; in_60: number; no_date: number; licences: number }; agents: LicenceExpiryRow[] }
export interface AgentNote { id: number; user_id: string; body: string; by_user: string; by_email: string | null; at: string }
export interface AgentInternal {
  tags: string[]; notes: AgentNote[]; holds: LegalHold[]; on_hold: boolean; complaints: number; complaints_active: number; pdpa: number;
  licence_expires_on: string | null; licence_number: string | null;
}
export interface RetentionCounts { records: number; records_on_hold: number; versions: number; sign_ins: number; problem_reports: number; usage_days: number }
export interface RetentionReview { id: number; cutoff: string; counts: RetentionCounts; decision: 'keep' | 'approve_later'; note: string; by_user: string; by_email: string | null; at: string }
export interface Retention {
  today: string; cutoff: string; deletion_enabled: boolean; counts: RetentionCounts; next_year: RetentionCounts;
  agents: { user_id: string; email: string; name: string | null; records: number; oldest: string; on_hold: boolean }[]; reviews: RetentionReview[];
}

// ---------- AdminBatch008: reports ----------
export type ReportColType = 'text' | 'num' | 'date' | 'bool';
/** One column of a report source: type, personal (names / emails: not for Viewers) and its plain-words label. */
export interface ReportCol { t: ReportColType; p?: boolean; l: string }
export interface ReportSource { label: string; date: string; columns: Record<string, ReportCol>; allowed?: boolean }
export type ReportCatalog = Record<string, ReportSource>;
export type ReportOp = 'in' | 'eq' | 'contains' | 'min' | 'max' | 'after' | 'before' | 'is';
export interface ReportFilter { col: string; op: ReportOp; value: string | number | string[] }
export interface ReportSpec {
  source: string; columns?: string[]; group_by?: string[]; measure?: string; from?: string; to?: string;
  filters?: ReportFilter[]; sort?: { by: string; dir: 'asc' | 'desc' }; limit?: number;
}
export type ReportRow = Record<string, string | number | boolean | null>;
export interface ReportResult { rows: ReportRow[]; count: number; truncated: boolean; run_at: string }
export interface SavedReport {
  id: string; name: string; source: string; spec: ReportSpec; created_by: string; created_by_email: string | null; created_at: string;
  updated_by: string | null; updated_at: string;
}
export interface BoardNumbers {
  from: string; to: string;
  agents: { total: number; new: number; active: number; not_active_now: number; status_changes: number };
  licences: { total: number; verified: number; expired_at_end: number; expiring_60_after: number; no_expiry_date: number };
  listings: { new: number; live_now: number; sold: number; rented: number; by_status_now: Record<string, number>; by_state_now: { state: string; listings: number }[] };
  complaints: { received: number; by_category: Record<string, number>; resolved: number; open_at_end: number };
  pdpa: { received: number; by_kind: Record<string, number>; with_deadline: number; answered_in_21: number; late: number };
  tickets: { received: number; fixed_or_closed: number };
  cases: { opened: number; closed: number; by_requester: Record<string, number>; packs: number };
  admin: { actions: number; exports: number; top_actions: { action: string; n: number }[] };
}
export interface BoardReport { month: string; month_end: string; complete: boolean; made_at: string; current: BoardNumbers; previous: BoardNumbers }
export interface AuditBundle {
  year: number; from: string; to: string; made_at: string; cap: number;
  chain: { actions: ChainCheck; access: ChainCheck };
  counts: { actions: number; access: number };
  actions: Omit<ActionRow, 'before' | 'after'>[]; access: Omit<AccessRow, 'detail'>[];
  backup_tests: BackupTest[];
  cases: (Omit<CaseFile, 'agents' | 'packs'> & { agents: number; packs: Pick<Pack, 'reference' | 'kind' | 'format' | 'sha256' | 'content_sha256' | 'created_at' | 'stored'>[] })[];
  vault: Pick<Pack, 'reference' | 'kind' | 'format' | 'sha256' | 'created_at' | 'stored'>[];
  pdpa: Omit<PdpaRequest, 'details' | 'history'>[]; complaints: Omit<Complaint, 'details' | 'history'>[];
  holds: LegalHold[]; retention_reviews: RetentionReview[];
}
// ---------- AdminBatch008: broadcasts, weekly report, Team Workspaces, To-Do & Calendar ----------
export type BcChannel = 'email' | 'whatsapp';
export type BcKind = 'service' | 'news';
export type BcStatus = 'draft' | 'queued' | 'sending' | 'done' | 'cancelled';
export type BcRecipientStatus = 'pending' | 'sent' | 'failed' | 'opened_wa' | 'cancelled' | 'skipped_no_consent' | 'skipped_no_address' | 'skipped_not_active';
export interface Broadcast {
  id: string; ref: string; channel: BcChannel; kind: BcKind;
  subject_en: string | null; subject_bm: string | null; subject_zh: string | null;
  body_en: string; body_bm: string | null; body_zh: string | null;
  audience: 'all' | 'groups'; group_ids: string[]; status: BcStatus;
  created_by: string; created_at: string; updated_at: string; queued_at: string | null; queued_by: string | null; queue_reason?: string | null;
  claimed_at: string | null; finished_at: string | null; created_by_email?: string | null; queued_by_email?: string | null;
  counts: Partial<Record<BcRecipientStatus, number>>;
  recipients?: BcRecipient[];
}
export interface BcRecipient {
  id: number; user_id: string; email: string; name: string | null; address: string | null; lang: 'en' | 'bm' | 'zh';
  status: BcRecipientStatus; error: string | null; sent_at: string | null; sent_by_email: string | null;
}
export type BroadcastDraft = Pick<Broadcast, 'channel' | 'kind' | 'body_en' | 'audience' | 'group_ids'> & Partial<Pick<Broadcast, 'id' | 'subject_en' | 'subject_bm' | 'subject_zh' | 'body_bm' | 'body_zh'>>;
export interface BcPreview { matched: number; reach: number; no_address: number; no_consent: number; not_active: number }
export interface ReportAdmin { user_id: string; email: string; role: Role }
export interface ReportSettings {
  enabled: boolean; weekday: number; hour: number; recipients: string[]; updated_by: string | null; updated_at: string;
  recipient_emails: ReportAdmin[]; can_receive: ReportAdmin[];
}
export interface ReportRun {
  id: string; ref: string; period_from: string; period_to: string; trigger: 'schedule' | 'manual'; status: 'making' | 'stored' | 'emailed' | 'failed';
  file_name: string | null; sha256: string | null; bytes: number | null; emailed_to: string[]; error: string | null;
  started_by: string; started_by_email?: string | null; created_at: string; finished_at: string | null;
}
export interface WorkspaceRow { id: string; name: string; created_at: string; owner_email: string | null; owner_name: string | null; members: number; records: number; listings: number }
export interface TeamRow {
  id: string; created_at: string; ended_at: string | null; end_reason: string | null; leader_email: string | null; leader_name: string | null;
  members: { email: string; name: string | null; joined_at: string; left_at: string | null }[];
}
export interface WorkspaceDetail {
  id: string; name: string; created_at: string; owner_user: string; owner_email: string | null; owner_name: string | null;
  members: { user_id: string; email: string; role: string; active: boolean; joined_at: string }[];
  by_kind: Record<string, number>; deleted: number;
}
export interface AdminTask {
  id: string; owner_user: string; shared: boolean; title: string; notes: string | null; due_on: string | null; done: boolean;
  done_at: string | null; done_by: string | null; created_at: string; updated_at: string; owner_email?: string | null; done_by_email?: string | null; mine?: boolean;
}
export interface AdminEvent {
  id: string; owner_user: string; shared: boolean; title: string; notes: string | null; place: string | null;
  starts_at: string; ends_at: string | null; all_day: boolean; created_at: string; updated_at: string; owner_email?: string | null; mine?: boolean;
}

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
  // AdminBatch004 — System Health
  healthDb: () => call<DbHealth>('eab_admin_health_db'),
  healthStorage: () => call<StorageHealth>('eab_admin_health_storage'),
  setHealthLimits: (patch: Partial<Pick<HealthLimits, 'db_limit_mb' | 'storage_limit_mb' | 'aws_backup' | 'aws_note'>>, reason: string) =>
    call<HealthLimits>('eab_admin_set_health_limits', { p_patch: patch, p_reason: reason, p_device: device }),
  backupTests: (limit = 200) => call<BackupTest[]>('eab_admin_backup_tests', { p_limit: limit }),
  backupTestAdd: (p: NewBackupTest) => call<BackupTest>('eab_admin_backup_test_add', { p, p_device: device }),
  syncHealth: (days = 30) => call<SyncHealth>('eab_admin_sync_health', { p_days: days, p_device: device }),
  pushHealth: () => call<PushHealth>('eab_admin_push_health'),
  performance: (days = 30) => call<Performance>('eab_admin_performance', { p_days: days }),
  errorReports: (status: ReportStatus | null = null, limit = 200) =>
    call<ErrorReports>('eab_admin_error_reports', { p_status: status, p_limit: limit, p_device: device }),
  // AdminBatch005 — Dashboards
  dashGrowth: (from: string, to: string, bucket: Bucket) => call<DashGrowth>('eab_admin_dash_growth', { p_from: from, p_to: to, p_bucket: bucket }),
  dashActive: (from: string, to: string) => call<DashActive>('eab_admin_dash_active', { p_from: from, p_to: to }),
  dashRetention: (from: string, to: string) => call<DashRetention>('eab_admin_dash_retention', { p_from: from, p_to: to, p_device: device }),
  dashInactive: (days: 30 | 60 | 90) => call<DashInactive>('eab_admin_dash_inactive', { p_days: days, p_device: device }),
  dashDevices: (from: string, to: string, version: string | null = null) =>
    call<DashDevices>('eab_admin_dash_devices', { p_from: from, p_to: to, p_version: version, p_device: device }),
  dashListings: (from: string, to: string, staleDays = 60) =>
    call<DashListings>('eab_admin_dash_listings', { p_from: from, p_to: to, p_stale_days: staleDays, p_device: device }),
  dashUsage: (from: string, to: string) => call<DashUsage>('eab_admin_dash_usage', { p_from: from, p_to: to }),
  dashEvents: (kind: string, name: string, from: string, to: string, limit = 200) =>
    call<DashEvents>('eab_admin_dash_events', { p_kind: kind, p_name: name, p_from: from, p_to: to, p_limit: limit, p_device: device }),
  // AdminBatch009 — Listings & market
  marketQuality: (below = 80, limit = 500) => call<MarketQuality>('eab_admin_market_quality', { p_below: below, p_limit: limit, p_device: device }),
  marketDom: (from: string, to: string) => call<MarketDom>('eab_admin_market_dom', { p_from: from, p_to: to }),
  marketPrice: (from: string, to: string) => call<MarketPrice>('eab_admin_market_price', { p_from: from, p_to: to, p_device: device }),
  marketAreas: (from: string, to: string) => call<MarketAreas>('eab_admin_market_areas', { p_from: from, p_to: to }),
  marketStuck: (days = 30) => call<MarketStuck>('eab_admin_market_stuck', { p_days: days, p_device: device }),
  marketCommission: (from: string, to: string) => call<MarketCommission>('eab_admin_market_commission', { p_from: from, p_to: to, p_device: device }),
  marketProjects: (from: string, to: string) => call<MarketProjects>('eab_admin_market_projects', { p_from: from, p_to: to }),
  marketNews: (from: string, to: string) => call<MarketNews>('eab_admin_market_news', { p_from: from, p_to: to }),
  // AdminBatch006 — News & Announcements (MainForAdmin-D functions + 006 helpers)
  feedList: (kind: FeedKind | null = null) => call<FeedItem[]>('eab_admin_feed_list', { p_kind: kind }),
  feedSave: (item: FeedDraft, reason: string) => call<FeedItem>('eab_admin_feed_save', { p_item: item, p_reason: reason, p_device: device }),
  feedSetStatus: (id: string, status: FeedStatus, reason: string) => call<FeedItem>('eab_admin_feed_set_status', { p_item: id, p_status: status, p_reason: reason, p_device: device }),
  groups: () => call<AudienceGroup[]>('eab_admin_group_list'),
  groupSave: (g: Partial<AudienceGroup>, reason: string) => call<AudienceGroup>('eab_admin_group_save', { p_group: g, p_reason: reason, p_device: device }),
  groupPreview: (filters: GroupFilters) => call<{ agents: number; of: number }>('eab_admin_group_preview', { p_filters: filters }),
  orderGet: (group: string) => call<{ item_id: string; position: number }[]>('eab_admin_feed_order_get', { p_group: group }),
  orderSet: (group: string, items: string[], reason: string) => call<number>('eab_admin_feed_order_set', { p_group: group, p_items: items, p_reason: reason, p_device: device }),
  codes: () => call<InviteCode[]>('eab_admin_code_list'),
  codeCreate: (label: string, items: string[], expiresAt: string | null, maxUses: number | null, reason: string) =>
    call<InviteCode>('eab_admin_code_create', { p_label: label, p_items: items, p_expires_at: expiresAt, p_max_uses: maxUses, p_reason: reason, p_device: device }),
  codeDisable: (code: string, reason: string) => call<InviteCode>('eab_admin_code_disable', { p_code: code, p_reason: reason, p_device: device }),
  codeGrants: (code: string) => call<CodeGrant[]>('eab_admin_code_grants', { p_code: code, p_device: device }),
  codeRevoke: (user: string, item: string, reason: string) => call<boolean>('eab_admin_code_revoke', { p_user: user, p_item: item, p_reason: reason, p_device: device }),
  pushList: () => call<PushReport[]>('eab_admin_push_list'),
  // AdminBatch006 — Support & operations
  tickets: (status: TicketStatus | 'open' | null = null, q: string | null = null, limit = 200) =>
    call<{ counts: Partial<Record<TicketStatus, number>>; tickets: TicketRow[] }>('eab_admin_tickets', { p_status: status, p_q: q, p_limit: limit, p_device: device }),
  ticket: (id: string) => call<Ticket>('eab_admin_ticket', { p_id: id, p_device: device }),
  ticketStatus: (id: string, status: TicketStatus, note: string) => call<Ticket>('eab_admin_ticket_set_status', { p_id: id, p_status: status, p_note: note, p_device: device }),
  ticketNote: (id: string, note: string) => call<Ticket>('eab_admin_ticket_note', { p_id: id, p_note: note, p_device: device }),
  flags: () => call<FeatureFlag[]>('eab_admin_flags'),
  flagSave: (f: Partial<FeatureFlag> & { key: string }, reason: string) => call<FeatureFlag>('eab_admin_flag_save', { p_flag: f, p_reason: reason, p_device: device }),
  opsSettings: () => call<OpsSettings>('eab_admin_settings'),
  setOps: (patch: Partial<Pick<OpsSettings, 'min_version' | 'min_version_mode' | 'update_url' | 'maintenance_on' | 'maintenance_message_en' | 'maintenance_message_bm' | 'maintenance_message_zh' | 'maintenance_back_at'>>, reason: string) =>
    call<OpsSettings>('eab_admin_set_settings', { p_patch: patch, p_reason: reason, p_device: device }),
  // AdminBatch006 — Overview
  master: () => call<MasterDash>('eab_admin_dash_master'),
  topAgents: (from: string, to: string, limit = 50) => call<{ from: string; to: string; agents: TopAgent[] }>('eab_admin_dash_top_agents', { p_from: from, p_to: to, p_limit: limit, p_device: device }),
  liveUsers: (minutes = 5) => call<LiveUsers>('eab_admin_live_users', { p_minutes: minutes, p_device: device }),
  // AdminBatch007 — compliance core
  pdpaList: (status: PdpaStatus | 'active' | null = null) => call<{ counts: Partial<Record<PdpaStatus, number>>; requests: PdpaRequest[] }>('eab_admin_pdpa_list', { p_status: status, p_device: device }),
  pdpaGet: (id: string) => call<PdpaRequest>('eab_admin_pdpa_get', { p_id: id, p_device: device }),
  pdpaCreate: (p: NewPdpa) => call<PdpaRequest>('eab_admin_pdpa_create', { p, p_device: device }),
  pdpaUpdate: (id: string, p: Partial<Pick<PdpaRequest, 'status' | 'decision' | 'decided_on' | 'supplied_on' | 'outcome' | 'case_id'>>, note: string) =>
    call<PdpaRequest>('eab_admin_pdpa_update', { p_id: id, p, p_note: note, p_device: device }),
  pdpaNote: (id: string, note: string) => call<PdpaRequest>('eab_admin_pdpa_note', { p_id: id, p_note: note, p_device: device }),
  complaints: (status: ComplaintStatus | 'active' | null = null, agent: string | null = null) =>
    call<{ counts: Partial<Record<ComplaintStatus, number>>; by_category: Partial<Record<ComplaintCategory, number>>; complaints: Complaint[] }>('eab_admin_complaints', { p_status: status, p_agent: agent, p_device: device }),
  complaintGet: (id: string) => call<Complaint>('eab_admin_complaint_get', { p_id: id, p_device: device }),
  complaintCreate: (p: NewComplaint) => call<Complaint>('eab_admin_complaint_create', { p, p_device: device }),
  complaintUpdate: (id: string, p: Partial<Pick<Complaint, 'status' | 'outcome' | 'case_id' | 'agent_user' | 'listing_ref'>>, note: string) =>
    call<Complaint>('eab_admin_complaint_update', { p_id: id, p, p_note: note, p_device: device }),
  complaintNote: (id: string, note: string) => call<Complaint>('eab_admin_complaint_note', { p_id: id, p_note: note, p_device: device }),
  holds: (active = true) => call<LegalHold[]>('eab_admin_holds', { p_active: active, p_device: device }),
  holdPlace: (agent: string, reason: string, caseId: string | null = null) => call<LegalHold>('eab_admin_hold_place', { p_agent: agent, p_reason: reason, p_case: caseId, p_device: device }),
  holdRelease: (id: string, reason: string) => call<LegalHold>('eab_admin_hold_release', { p_id: id, p_reason: reason, p_device: device }),
  setLicenceExpiry: (user: string, expires: string | null, reason: string) => call<unknown>('eab_admin_set_licence_expiry', { p_user: user, p_expires: expires, p_reason: reason, p_device: device }),
  licenceExpiry: (within = 60) => call<LicenceExpiry>('eab_admin_licence_expiry', { p_within: within, p_device: device }),
  agentInternal: (user: string) => call<AgentInternal>('eab_admin_agent_internal', { p_user: user, p_device: device }),
  agentTag: (user: string, tag: string, add: boolean) => call<string[]>('eab_admin_agent_tag', { p_user: user, p_tag: tag, p_add: add, p_device: device }),
  agentNote: (user: string, note: string) => call<AgentNote>('eab_admin_agent_note', { p_user: user, p_note: note, p_device: device }),
  tagList: () => call<{ tag: string; agents: number }[]>('eab_admin_tag_list'),
  retention: () => call<Retention>('eab_admin_retention', { p_device: device }),
  retentionReview: (decision: 'keep' | 'approve_later', note: string) => call<RetentionReview>('eab_admin_retention_review', { p_decision: decision, p_note: note, p_device: device }),
  feedSchedule: (id: string, at: string, reason: string) => call<FeedItem>('eab_admin_feed_schedule', { p_item: id, p_at: at, p_reason: reason, p_device: device }),
  // AdminBatch008 — reports
  reportCatalog: () => call<ReportCatalog>('eab_admin_report_catalog'),
  reportRun: (spec: ReportSpec) => call<ReportResult>('eab_admin_report_run', { p_spec: spec, p_device: device }),
  savedReports: () => call<SavedReport[]>('eab_admin_saved_reports'),
  savedReportSave: (r: { id?: string; name: string; source: string; spec: ReportSpec }) => call<SavedReport>('eab_admin_saved_report_save', { p: r, p_device: device }),
  savedReportDelete: (id: string) => call<boolean>('eab_admin_saved_report_delete', { p_id: id, p_device: device }),
  boardReport: (month: string) => call<BoardReport>('eab_admin_board_report', { p_month: month, p_device: device }),
  auditBundle: (year: number) => call<AuditBundle>('eab_admin_audit_bundle', { p_year: year, p_device: device }),
  // AdminBatch008 — broadcasts, weekly report, Team Workspaces, To-Do & Calendar
  broadcasts: (limit = 200) => call<Broadcast[]>('eab_admin_broadcasts', { p_limit: limit }),
  broadcast: (id: string) => call<Broadcast>('eab_admin_broadcast', { p_id: id, p_device: device }),
  broadcastSave: (p: BroadcastDraft) => call<Broadcast>('eab_admin_broadcast_save', { p, p_device: device }),
  broadcastPreview: (id: string) => call<BcPreview>('eab_admin_broadcast_preview', { p_id: id }),
  broadcastQueue: (id: string, reason: string) => call<Broadcast>('eab_admin_broadcast_queue', { p_id: id, p_reason: reason, p_device: device }),
  broadcastCancel: (id: string, reason: string) => call<Broadcast>('eab_admin_broadcast_cancel', { p_id: id, p_reason: reason, p_device: device }),
  broadcastWaOpened: (recipient: number) => call<Broadcast>('eab_admin_broadcast_wa_opened', { p_recipient: recipient, p_device: device }),
  reportSettings: () => call<ReportSettings>('eab_admin_report_settings'),
  reportSettingsSave: (p: Partial<Pick<ReportSettings, 'enabled' | 'weekday' | 'hour' | 'recipients'>>, reason: string) =>
    call<ReportSettings>('eab_admin_report_settings_save', { p, p_reason: reason, p_device: device }),
  reports: (limit = 100) => call<ReportRun[]>('eab_admin_reports', { p_limit: limit, p_device: device }),
  reportDownload: (id: string) => call<{ path: string; file_name: string; sha256: string }>('eab_admin_report_download', { p_run: id, p_device: device }),
  checkReport: (sha: string) => call<ReportRun | null>('eab_admin_check_report', { p_sha256: sha, p_device: device }),
  workspaces: (q: string | null = null) => call<{ workspaces: WorkspaceRow[]; teams: TeamRow[] }>('eab_admin_workspaces', { p_q: q, p_device: device }),
  workspace: (id: string) => call<WorkspaceDetail>('eab_admin_workspace', { p_id: id, p_device: device }),
  todo: () => call<{ tasks: AdminTask[]; events: AdminEvent[] }>('eab_admin_todo'),
  taskSave: (p: Partial<AdminTask> & { removed?: boolean }) => call<AdminTask>('eab_admin_task_save', { p, p_device: device }),
  eventSave: (p: Partial<AdminEvent> & { removed?: boolean }) => call<AdminEvent>('eab_admin_event_save', { p, p_device: device }),
  setSettings: (patch: Partial<Pick<Settings, 'company_name' | 'support_email' | 'business_address'>>, reason: string) =>
    call<Settings>('eab_admin_set_settings', { p_patch: patch, p_reason: reason, p_device: device }),
  setAdmin: (email: string, role: Role, active: boolean, expiresAt: string | null, reason: string) =>
    call<AdminRow>('eab_admin_set_admin', { p_email: email, p_role: role, p_active: active, p_expires_at: expiresAt, p_reason: reason, p_device: device }),
});
export type Api = ReturnType<typeof api>;
