// AdminBatch010 — Moderation (features 16, 57, 56). Owner, Admin and Compliance only.
//   Cases       the moderation register: MOD-YYYY-####, reason, status, outcome, history (never deleted)
//   Checks      automatic suspects: price far from the area, no title type, no price, no photos, same photo / spot
//   Photos      listing photos to mark OK or Flag (a flag opens a case)
//   Duplicates  the same photo, unit address or map spot used by different agents
// Moderation only RECORDS the decision. Nothing in the main app is hidden or changed; the admin contacts the agent
// (Email & WhatsApp Broadcast) or refers the case to the Complaint Register.
import { useCallback, useEffect, useState } from 'react';
import { ModTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { Complaint, ModCase, ModListing, ModReason, ModStatus, PhotoStatus, QueuePhoto } from '../api/admin';
import { fmtNum } from '../admin/dash';
import { fmtRm } from '../admin/market';
import {
  DUP_KIND_LABEL, LISTING_REASONS, MOD_SOURCE_LABEL, MOD_STATUS_LABEL, PHOTO_REASONS, fmtBytes, modReasonLabel, modStatusLabel, modStatusTag,
} from '../admin/content';
import { fmtTime } from '../export/reports';
import { exportModeration } from '../export/content';
import { AgentLink, Head, Stat, useLoad } from './Dashboards';
import { HBars } from './charts';
import { Events } from './Compliance';
import { ErrorBox, Kv, Loading } from './ui';

/** Like the Dashboards loader, plus setData so a saved change shows at once (same as the complaint screens). */
function useCase<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => { setErr(null); try { setData(await fn()); } catch (e) { setErr(errText(e)); } }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load, setData };
}

const TABS: { k: ModTab; label: string }[] = [
  { k: 'cases', label: 'Cases' }, { k: 'suspects', label: 'Automatic checks' }, { k: 'photos', label: 'Photos' }, { k: 'duplicates', label: 'Duplicates' },
];
const where = (l: { city: string | null; state: string | null }) => [l.city, l.state].filter(Boolean).join(', ') || '—';
const price = (l: ModListing) => (l.asking ? fmtRm(l.asking) : l.rent ? `${fmtRm(l.rent)} / month` : 'no price');

export function ModerationScreen({ tab: first }: { tab: ModTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<ModTab>(first);
  return (
    <div className="stack" data-testid="moderation">
      <div className="row">
        <h1 className="spacer">Moderation</h1>
        {can(me.role, 'export') && <ModExport />}
      </div>
      <div className="tabs" role="group" aria-label="Moderation">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`modtab-${t.k}`}>{t.label}</button>)}
      </div>
      {tab === 'cases' && <CasesTab />}
      {tab === 'suspects' && <SuspectsTab />}
      {tab === 'photos' && <PhotosTab />}
      {tab === 'duplicates' && <DuplicatesTab />}
      <p className="notice small">Moderation only records what was checked and decided. Nothing is hidden in the agent's app: ask the agent to fix the
        listing (Email &amp; WhatsApp Broadcast), or refer the case to the Complaint Register.</p>
    </div>
  );
}

// ---------------------------------------------------------------- raise a case (from a check, a duplicate or a listing)
export function RaiseCase({ listing, reason, details, onDone, onClose }: {
  listing: ModListing; reason?: ModReason; details?: string; onDone: (c: ModCase) => void; onClose: () => void;
}) {
  const { api } = useAdmin();
  const [r, setR] = useState<ModReason>(reason ?? 'misleading');
  const [text, setText] = useState(details ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = text.trim().length >= 5;
  const save = async () => {
    setBusy(true); setErr(null);
    try { onDone(await api.modCreate({ kind: 'listing', agent_user: listing.user_id, record_id: listing.id, reason: r, source: reason ? 'suspect' : 'admin', details: text.trim() })); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="raise-case">
      <h3>Open a moderation case — {listing.ref ?? listing.id}</h3>
      <small className="muted">{listing.headline ?? listing.type ?? ''} · {where(listing)} · {listing.name ?? listing.email}</small>
      <label className="field"><span>Reason</span>
        <select value={r} onChange={e => setR(e.target.value as ModReason)} data-testid="raise-reason">
          {LISTING_REASONS.map(k => <option key={k} value={k}>{modReasonLabel(k)}</option>)}
        </select></label>
      <label className="field"><span>What is wrong (saved in the case and the audit log)</span>
        <textarea rows={3} maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder="At least 5 characters" data-testid="raise-details" /></label>
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row"><button className="btn" onClick={onClose}>Cancel</button><span className="spacer" />
        <button className="btn gold" disabled={!ok || busy} onClick={() => void save()} data-testid="raise-save">{busy ? 'Saving…' : 'Open case'}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- 16 Cases
function CasesTab() {
  const { api, go } = useAdmin();
  const [filter, setFilter] = useState<ModStatus | 'closed' | null>('open');
  const { data, err, busy, load } = useLoad(() => api.modCases(filter), [api, filter]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const c = data.counts;
  return (
    <div className="stack" data-testid="mod-cases">
      <Head title="Moderation cases" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Open" value={fmtNum(c.open ?? 0)} level={c.open ? 'amber' : 'ok'} />
        <Stat label="Confirmed" value={fmtNum(c.confirmed ?? 0)} sub="agent asked to fix" />
        <Stat label="Referred" value={fmtNum(c.referred ?? 0)} sub="to a complaint" />
        <Stat label="Cleared" value={fmtNum(c.cleared ?? 0)} sub="nothing wrong" />
      </div>
      {Object.keys(data.by_reason).length > 0 && (
        <div className="card stack"><h3>Open cases by reason</h3>
          <HBars label="Open cases by reason" items={Object.entries(data.by_reason).map(([k, n]) => ({ key: k, label: modReasonLabel(k), value: n ?? 0 }))} /></div>
      )}
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {([['open', 'Open'], ['closed', 'Closed'], [null, 'All']] as const).map(([k, t]) =>
          <button key={String(k)} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`mfilter-${k ?? 'all'}`}>{t}</button>)}
      </div>
      {data.cases.length === 0 ? <p className="muted">No cases here. Open one from Automatic checks, Photos or Duplicates.</p> : (
        <div className="stack" data-testid="mod-list">
          {data.cases.map(x => (
            <button key={x.id} className="item ticket" onClick={() => go({ k: 'modcase', id: x.id })} data-testid="mod-row">
              <div className="row"><b className="code">{x.ref}</b><span className={`tag ${modStatusTag(x.status)}`}>{modStatusLabel(x.status)}</span>
                <span className="tag">{x.kind === 'photo' ? 'Photo' : 'Listing'}</span><span className="tag">{modReasonLabel(x.reason)}</span>
                <span className="spacer" /><small className="muted">{fmtTime(x.created_at)}</small></div>
              <span>{x.agent_name ?? x.agent_email ?? '—'}{x.listing_ref ? ` · listing ${x.listing_ref}` : ''}</span>
              <small className="muted clamp">{x.summary}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModCaseScreen({ id }: { id: string }) {
  const { api, go } = useAdmin();
  const { data: c, err, setData } = useCase(() => api.modGet(id), [api, id]);
  const [status, setStatus] = useState<ModStatus | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [complaint, setComplaint] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  useEffect(() => {
    if (!c?.agent_user) return;
    api.complaints(null, c.agent_user).then(r => setComplaints(r.complaints)).catch(() => setComplaints([]));
  }, [api, c?.agent_user]);
  if (err) return <ErrorBox text={err} />;
  if (!c) return <Loading />;
  const patch = {
    ...(status && status !== c.status ? { status } : {}),
    ...(outcome !== null && outcome !== (c.outcome ?? '') ? { outcome } : {}),
    ...(complaint !== undefined && complaint !== c.complaint_id ? { complaint_id: complaint } : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const needsComplaint = (status ?? c.status) === 'referred' && !(complaint === undefined ? c.complaint_id : complaint);
  const save = async () => {
    setBusy(true); setAErr(null);
    try {
      setData(changed ? await api.modUpdate(c.id, patch, note.trim()) : await api.modNote(c.id, note.trim()));
      setNote(''); setStatus(null); setOutcome(null); setComplaint(undefined);
    } catch (e) { setAErr(errText(e)); } finally { setBusy(false); }
  };
  const l = c.listing;
  return (
    <div className="stack" data-testid="mod-case">
      <div className="row"><h1 className="spacer code">{c.ref}</h1><span className={`tag ${modStatusTag(c.status)}`} data-testid="mod-status">{modStatusLabel(c.status)}</span></div>
      <div className="card"><Kv rows={[
        { k: 'What', v: `${c.kind === 'photo' ? 'Photo' : 'Listing'} · ${modReasonLabel(c.reason)}` },
        { k: 'Agent', v: c.agent_user ? <><AgentLink id={c.agent_user} email={c.agent_email} name={c.agent_name} />
          {c.agent_cases && c.agent_cases > 1 ? <span className="tag amber"> {c.agent_cases} cases in total</span> : null}</> : null },
        { k: 'Listing', v: l ? <>{l.ref ?? l.id} · {l.headline ?? l.type ?? ''} · {where(l)} · {price(l)}
          {c.agent_user && <> · <button className="linkbtn" onClick={() => go({ k: 'agent', id: c.agent_user!, collection: 'properties', record: l.id })}>open in the agent profile</button></>}</> : c.listing_ref },
        { k: 'Photo', v: c.file_sha ? <code>{c.file_sha.slice(0, 12)}…</code> : null },
        { k: 'Raised', v: `${fmtTime(c.created_at)} · ${MOD_SOURCE_LABEL[c.source] ?? c.source}` },
        { k: 'What is wrong', v: <span style={{ whiteSpace: 'pre-wrap' }}>{c.details}</span> },
        { k: 'Outcome', v: c.outcome },
        { k: 'Complaint', v: c.complaint_ref && c.complaint_id ? <button className="linkbtn" onClick={() => go({ k: 'complaint', id: c.complaint_id! })}>{c.complaint_ref}</button> : null },
      ]} /></div>
      <h2>History</h2>
      <Events items={c.history ?? []} words={MOD_STATUS_LABEL} />
      <div className="card boxed stack" data-testid="mod-actions">
        <div className="row"><span className="muted small">Status:</span>
          {(Object.keys(MOD_STATUS_LABEL) as ModStatus[]).filter(s => s !== c.status).map(s =>
            <button key={s} className={`btn small ${status === s ? 'gold' : ''}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)} data-testid={`mod-to-${s}`}>{MOD_STATUS_LABEL[s]}</button>)}
        </div>
        <label className="field"><span>Outcome</span><input value={outcome ?? c.outcome ?? ''} onChange={e => setOutcome(e.target.value)} data-testid="mod-outcome" /></label>
        <label className="field"><span>Complaint it was referred to{(status ?? c.status) === 'referred' ? ' (needed)' : ' (optional)'}</span>
          <select value={(complaint === undefined ? c.complaint_id : complaint) ?? ''} onChange={e => setComplaint(e.target.value || null)} data-testid="mod-complaint">
            <option value="">— none —</option>
            {(complaints ?? []).map(x => <option key={x.id} value={x.id}>{x.ref} · {x.complainant_name}</option>)}
          </select></label>
        {(complaints?.length ?? 0) === 0 && (status ?? c.status) === 'referred' && (
          <small className="muted">This agent has no complaint yet. Log one in <button className="linkbtn" onClick={() => go({ k: 'complaints' })}>Complaints</button> first.</small>)}
        <label className="field"><span>{changed ? 'Reason for this change (needed)' : 'Note'}</span>
          <textarea rows={2} maxLength={4000} value={note} onChange={e => setNote(e.target.value)} data-testid="mod-note" /></label>
        {aErr && <p className="error small" role="alert">{aErr}</p>}
        <div className="row"><span className="spacer" />
          <button className="btn gold" disabled={busy || !note.trim() || needsComplaint} onClick={() => void save()} data-testid="mod-apply">{busy ? 'Saving…' : changed ? 'Save change' : 'Save note'}</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 16 Automatic checks
function SuspectsTab() {
  const { api, go } = useAdmin();
  const { data, err, busy, load } = useLoad(() => api.modSuspects(), [api]);
  const [only, setOnly] = useState<string | null>(null);
  const [raise, setRaise] = useState<{ l: ModListing; reason: ModReason; detail: string } | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const rows = data.listings.filter(l => !only || l.reasons.some(r => r.reason === only));
  return (
    <div className="stack" data-testid="mod-suspects">
      <Head title="Automatic checks (listings on the market)" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Listings checked" value={fmtNum(data.checked)} />
        <Stat label="Picked out" value={fmtNum(data.listings.length)} level={data.listings.length ? 'amber' : 'ok'} />
      </div>
      <div className="card stack">
        <h3>What the checks found</h3>
        <HBars testid="suspect-reasons" label="Listings picked out, by check" onPick={k => setOnly(o => (o === k ? null : k))}
          items={Object.entries(data.counts).map(([k, n]) => ({ key: k, label: modReasonLabel(k), value: n ?? 0 }))} />
        <small className="muted">Tap a line to show only those listings.</small>
      </div>
      {raise && <RaiseCase listing={raise.l} reason={raise.reason} details={raise.detail} onClose={() => setRaise(null)}
        onDone={c => { setRaise(null); go({ k: 'modcase', id: c.id }); }} />}
      <div className="row"><h3 className="spacer">Listings{only ? ` — ${modReasonLabel(only)}` : ''}</h3>
        {only && <button className="btn small" onClick={() => setOnly(null)}>Show all</button>}</div>
      {rows.length === 0 ? <p className="muted">Nothing picked out.</p> : (
        <div className="tablewrap dash-table mkt-table">
          <table data-testid="suspect-list">
            <thead><tr><th>Listing</th><th>Agent</th><th>Price</th><th>Why</th></tr></thead>
            <tbody>{rows.map(l => (
              <tr key={`${l.user_id}/${l.id}`}>
                <td><b>{l.ref ?? l.id}</b><br /><small className="muted">{l.headline ?? l.type ?? ''} · {where(l)}</small></td>
                <td><AgentLink id={l.user_id} email={l.email} name={l.name} /></td>
                <td className="small">{price(l)}</td>
                <td className="small"><div className="stack" style={{ gap: 4 }}>{l.reasons.map(r => (
                  <div key={r.reason} className="row" style={{ gap: 6 }}>
                    <span className="tag amber">{modReasonLabel(r.reason)}</span><span className="muted">{r.detail}</span>
                    {r.case_ref ? <span className="tag" data-testid="suspect-case">{r.case_ref} open</span>
                      : <button className="btn small" data-testid="suspect-raise" onClick={() => setRaise({ l, reason: r.reason, detail: `${modReasonLabel(r.reason)}: ${r.detail}` })}>Open case</button>}
                  </div>))}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="notice small" data-testid="limit">Price far from the area = sale price per sq ft under half or over double the median of the same city and
        property type (needs 3 other listings to compare). Same spot = within about 30 m of another agent's listing of the same type.
        No photos = none 14 days after the listing was added. Lists name agents and are recorded in the access log.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 57 Photos
function PhotosTab() {
  const { api } = useAdmin();
  const [status, setStatus] = useState<PhotoStatus>('unreviewed');
  const { data, err, busy, load } = useLoad(() => api.photoQueue(status, 120), [api, status]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const n = data.counts;
  return (
    <div className="stack" data-testid="mod-photos">
      <Head title="Listing photos" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Photos in the cloud" value={fmtNum(n.all)} />
        <Stat label="Not reviewed" value={fmtNum(n.unreviewed)} level={n.unreviewed ? 'amber' : 'ok'} />
        <Stat label="Flagged" value={fmtNum(n.flagged)} level={n.flagged ? 'red' : 'ok'} />
        <Stat label="Used by 2+ agents" value={fmtNum(n.shared)} level={n.shared ? 'amber' : 'ok'} />
      </div>
      <div className="tabs" role="group" aria-label="Show" style={{ margin: 0 }}>
        {([['unreviewed', 'Not reviewed'], ['flagged', 'Flagged'], ['ok', 'OK'], ['all', 'All']] as const).map(([k, t]) =>
          <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} data-testid={`pfilter-${k}`}>{t} ({fmtNum(n[k])})</button>)}
      </div>
      {data.photos.length === 0 ? <p className="muted">No photos here.</p> : (
        <div className="photo-grid" data-testid="photo-grid">
          {data.photos.map(p => <PhotoCard key={`${p.workspace_id}/${p.sha256}/${p.listing.id}`} p={p} onDone={() => void load()} />)}
        </div>
      )}
      <p className="notice small">Only listing photos can be opened here — never documents or confidential files. Each review is kept for good;
        flagging a photo opens a moderation case. Photos come from the agents' cloud backup, so a listing that was never synced has none here.</p>
    </div>
  );
}

function PhotoImg({ path, alt }: { path: string; alt: string }) {
  const { api } = useAdmin();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false, made: string | null = null;
    if (!api.files.photo) { setFailed(true); return; }
    api.files.photo(path).then(b => { if (gone) return; made = URL.createObjectURL(b); setUrl(made); }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [api, path]);
  if (failed) return <div className="photo-missing small muted">Photo not available</div>;
  if (!url) return <div className="photo-missing small muted">Loading…</div>;
  return <img src={url} alt={alt} data-testid="photo-img" />;
}

function PhotoCard({ p, onDone }: { p: QueuePhoto; onDone: () => void }) {
  const { api } = useAdmin();
  const [flagging, setFlagging] = useState(false);
  const [why, setWhy] = useState('');
  const [reason, setReason] = useState<ModReason>(p.other_agents > 0 ? 'same_photo' : 'wrong_photo');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const l = p.listing;
  const review = async (decision: 'ok' | 'flagged') => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.photoReview(p.workspace_id, p.sha256, decision, decision === 'flagged' ? why.trim() : null, decision === 'flagged' ? reason : null);
      setMsg({ ok: true, text: decision === 'ok' ? 'Marked OK' : `Flagged · case ${r.case_ref}` }); setFlagging(false); onDone();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="card photo-card stack" data-testid="photo-card">
      <PhotoImg path={p.path} alt={`Photo of ${l.ref ?? l.id}`} />
      <div className="row" style={{ gap: 6 }}><b>{l.ref ?? l.id}</b>
        {p.decision && <span className={`tag ${p.decision === 'ok' ? 'ok' : 'red'}`}>{p.decision === 'ok' ? 'OK' : 'Flagged'}</span>}
        {p.other_agents > 0 && <span className="tag amber" data-testid="photo-shared">also used by {p.other_agents} other agent{p.other_agents === 1 ? '' : 's'}</span>}</div>
      <small className="muted">{l.headline ?? l.type ?? ''} · {where(l)}</small>
      <small><AgentLink id={l.user_id} email={l.email} name={l.name} /> · {fmtTime(p.uploaded_at)} · {fmtBytes(p.bytes)}</small>
      {p.reviewed_at && <small className="muted">{p.decision === 'flagged' ? `Flagged: ${p.reason ?? ''}` : 'Marked OK'} · {p.reviewed_by} · {fmtTime(p.reviewed_at)}{p.case_ref ? ` · ${p.case_ref}` : ''}</small>}
      {flagging ? (
        <div className="stack">
          <select value={reason} onChange={e => setReason(e.target.value as ModReason)} data-testid="photo-reason">
            {PHOTO_REASONS.map(k => <option key={k} value={k}>{modReasonLabel(k)}</option>)}
          </select>
          <textarea rows={2} maxLength={2000} value={why} onChange={e => setWhy(e.target.value)} placeholder="What is wrong? At least 5 characters." data-testid="photo-why" />
          <div className="row"><button className="btn small" onClick={() => setFlagging(false)}>Cancel</button><span className="spacer" />
            <button className="btn small danger" disabled={busy || why.trim().length < 5} onClick={() => void review('flagged')} data-testid="photo-flag-save">Flag and open case</button></div>
        </div>
      ) : (
        <div className="row">
          {p.decision !== 'ok' && <button className="btn small" disabled={busy} onClick={() => void review('ok')} data-testid="photo-ok">OK</button>}
          {p.decision !== 'flagged' && <button className="btn small danger" disabled={busy} onClick={() => setFlagging(true)} data-testid="photo-flag">Flag</button>}
        </div>
      )}
      {msg && <small className={msg.ok ? '' : 'error'} role="status">{msg.text}</small>}
    </div>
  );
}

// ---------------------------------------------------------------- 56 Duplicates
function DuplicatesTab() {
  const { api, go } = useAdmin();
  const { data, err, busy, load } = useLoad(() => api.dupListings(), [api]);
  const [raise, setRaise] = useState<{ l: ModListing; reason: ModReason; detail: string } | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const reasonOf = (k: string): ModReason => (k === 'photo' ? 'same_photo' : k === 'address' ? 'same_address' : 'same_spot');
  return (
    <div className="stack" data-testid="mod-duplicates">
      <Head title="Duplicate listings (different agents)" onRefresh={() => void load()} busy={busy} />
      <div className="stats">
        <Stat label="Same photo" value={fmtNum(data.counts.photo)} level={data.counts.photo ? 'amber' : 'ok'} />
        <Stat label="Same unit address" value={fmtNum(data.counts.address)} level={data.counts.address ? 'amber' : 'ok'} />
        <Stat label="Same map spot" value={fmtNum(data.counts.spot)} level={data.counts.spot ? 'amber' : 'ok'} />
      </div>
      {raise && <RaiseCase listing={raise.l} reason={raise.reason} details={raise.detail} onClose={() => setRaise(null)}
        onDone={c => { setRaise(null); go({ k: 'modcase', id: c.id }); }} />}
      {data.groups.length === 0 ? <p className="muted">No duplicates found.</p> : data.groups.map(g => (
        <div key={`${g.kind}/${g.key}`} className="card stack" data-testid={`dup-${g.kind}`}>
          <div className="row"><b className="spacer">{DUP_KIND_LABEL[g.kind]}</b><span className="tag">{g.agents} agents</span></div>
          <small className="muted">{g.kind === 'photo' ? `Photo fingerprint ${g.key}…` : g.key}</small>
          <div className="tablewrap"><table className="small">
            <thead><tr><th>Listing</th><th>Agent</th><th>Price</th><th>Last change</th><th /></tr></thead>
            <tbody>{g.listings.map(l => (
              <tr key={`${l.user_id}/${l.id}`} data-testid="dup-listing">
                <td><b>{l.ref ?? l.id}</b><br /><small className="muted">{l.headline ?? l.type ?? ''} · {where(l)}</small></td>
                <td><AgentLink id={l.user_id} email={l.email} name={l.name} /></td><td>{price(l)}</td><td>{fmtTime(l.updated_at)}</td>
                <td><button className="btn small" onClick={() => setRaise({ l, reason: reasonOf(g.kind),
                  detail: `${DUP_KIND_LABEL[g.kind]} as ${g.listings.filter(o => o.user_id !== l.user_id).map(o => `${o.ref ?? o.id} (${o.email ?? ''})`).join(', ')}` })}
                  data-testid="dup-raise">Open case</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
      <p className="notice small">Two agents can honestly list the same property (both have the owner's consent). A duplicate is a reason to check,
        not proof of wrongdoing. The list names agents and is recorded in the access log.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Export (Owner + Compliance): the register as Excel
function ModExport() {
  const { api, me } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    try { const r = await exportModeration(api, me.email); setMsg({ ok: true, text: `${r.reference}: ${r.how}` }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="row">
      <button className="btn small gold" disabled={busy} onClick={() => void run()} data-testid="mod-xlsx">{busy ? 'Making…' : 'Register (Excel)'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="mod-export-msg">{msg.text}</small>}
    </div>
  );
}
