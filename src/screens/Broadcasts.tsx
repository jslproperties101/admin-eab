// AdminBatch008 — Email & WhatsApp broadcast (feature 64), Joe's decisions 22 Oct 2026:
//   * Two kinds: "Service notice" (account, rules, system) goes to everyone chosen; "News & offers" only to agents who said
//     yes to news & offers. Suspended / banned / closed accounts are never sent to.
//   * Email through Resend (server function send-broadcast). Until a domain is verified in Resend, it only delivers to
//     the Resend account's own address — the others show as failed with Resend's reason.
//   * WhatsApp: tap-to-send (WhatsApp opens with the message typed in; the admin presses Send) works now; the WhatsApp
//     Business sender is built and starts working when the Meta keys are added on the server.
//   * Queueing needs a typed reason + second confirmation; at that moment the list of who gets it is fixed and kept for
//     good (who, address, language, why skipped). Nobody is ever sent the same broadcast twice.
import { useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { AudienceGroup, Broadcast, BroadcastDraft, BcPreview, BcRecipient, BroadcastSendResult } from '../api/admin';
import { BC_STATUS, LANG_LABEL, RCP_STATUS, countsLine, draftProblem, showPhone, textFor, waLink, type Lang } from '../admin/comms';
import { isNative, openInBrowser } from '../native/native';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

const statusTag = (s: Broadcast['status']) => (s === 'done' ? 'ok' : s === 'cancelled' ? '' : s === 'draft' ? '' : 'amber');
const KIND_HELP = {
  service: 'Service notice — about the agent’s account, the rules or the app. Goes to everyone you choose.',
  news: 'News & offers — only agents who said yes to news & offers get it. Every email has a link to stop them.',
};

export function BroadcastsScreen({ to }: { to?: { id: string; label: string }[] }) {
  const { api, me, go } = useAdmin();
  const edit = can(me.role, 'editBroadcasts');
  const names = can(me.role, 'broadcastNames');
  const [rows, setRows] = useState<Broadcast[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [writing, setWriting] = useState(!!to?.length);
  const load = useCallback(async () => { setErr(null); try { setRows(await api.broadcasts()); } catch (e) { setErr(errText(e)); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="stack" data-testid="broadcasts">
      <div className="row"><h1 className="spacer">Email & WhatsApp broadcast</h1>
        {edit && !writing && <button className="btn gold" onClick={() => setWriting(true)} data-testid="bc-new">New broadcast</button>}</div>
      <p className="muted small" style={{ margin: 0 }}>{KIND_HELP.service} {KIND_HELP.news}</p>
      {writing && <BroadcastEditor draft={null} to={to} onClose={() => setWriting(false)} onSaved={b => go({ k: 'broadcast', id: b.id })} />}
      {err ? <ErrorBox text={err} onRetry={() => void load()} /> : !rows ? <Loading /> : rows.length === 0 ? <p className="muted">No broadcasts yet.</p> : (
        <div className="stack" data-testid="bc-list">
          {rows.map(b => {
            const body = (
              <>
                <div className="row"><span className={`tag ${statusTag(b.status)}`}>{BC_STATUS[b.status]}</span>
                  <span className="tag">{b.channel === 'email' ? 'Email' : 'WhatsApp'}</span>
                  <span className="tag">{b.kind === 'news' ? 'News & offers' : 'Service notice'}</span>
                  <b className="spacer">{b.channel === 'email' ? b.subject_en : b.body_en.slice(0, 60)}</b>
                  <small className="muted">{b.ref} · {fmtTime(b.created_at)}</small></div>
                <small className="muted">{countsLine(b.counts)}</small>
              </>
            );
            return names
              ? <button key={b.id} className="item" onClick={() => go({ k: 'broadcast', id: b.id })} data-testid="bc-row">{body}</button>
              : <div key={b.id} className="item" data-testid="bc-row">{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function BroadcastEditor({ draft, to, onClose, onSaved }: { draft: Broadcast | null; to?: { id: string; label: string }[]; onClose: () => void; onSaved: (b: Broadcast) => void }) {
  const { api } = useAdmin();
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [d, setD] = useState<BroadcastDraft>(() => draft
    ? { id: draft.id, channel: draft.channel, kind: draft.kind, subject_en: draft.subject_en, subject_bm: draft.subject_bm, subject_zh: draft.subject_zh,
        body_en: draft.body_en, body_bm: draft.body_bm, body_zh: draft.body_zh, audience: draft.audience, group_ids: draft.group_ids, user_ids: draft.user_ids ?? [] }
    : to?.length ? { channel: 'email', kind: 'service', subject_en: '', body_en: '', audience: 'agents', group_ids: [], user_ids: to.map(a => a.id) }
    : { channel: 'email', kind: 'service', subject_en: '', body_en: '', audience: 'all', group_ids: [] });
  const chosen = d.user_ids?.length ?? 0;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.groups().then(g => setGroups(g.filter(x => x.active && x.id !== '00000000-0000-0000-0000-000000000000'))).catch(() => setGroups([])); }, [api]);
  const set = (p: Partial<BroadcastDraft>) => setD(x => ({ ...x, ...p }));
  const problem = draftProblem({ ...d, subject_en: d.subject_en ?? '' });
  const save = async () => {
    setBusy(true); setErr(null);
    try { onSaved(await api.broadcastSave(d)); } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const langs: Lang[] = ['en', 'bm', 'zh'];
  return (
    <div className="card boxed stack" data-testid="bc-editor">
      <div className="row"><h3 className="spacer">{draft ? `Change draft ${draft.ref}` : 'New broadcast'}</h3><button className="btn small" onClick={onClose}>Cancel</button></div>
      <fieldset className="stack"><legend>Send by</legend>
        <label className="choice"><input type="radio" checked={d.channel === 'email'} onChange={() => set({ channel: 'email' })} data-testid="bc-email" /> Email</label>
        <label className="choice"><input type="radio" checked={d.channel === 'whatsapp'} onChange={() => set({ channel: 'whatsapp' })} data-testid="bc-whatsapp" /> WhatsApp (to the Contact number agents entered in their Agent Profile)</label>
      </fieldset>
      <fieldset className="stack"><legend>Kind</legend>
        <label className="choice"><input type="radio" checked={d.kind === 'service'} onChange={() => set({ kind: 'service' })} data-testid="bc-service" /> {KIND_HELP.service}</label>
        <label className="choice"><input type="radio" checked={d.kind === 'news'} onChange={() => set({ kind: 'news' })} data-testid="bc-news" /> {KIND_HELP.news}</label>
      </fieldset>
      <fieldset className="stack"><legend>Who</legend>
        {chosen > 0 && <label className="choice"><input type="radio" checked={d.audience === 'agents'} onChange={() => set({ audience: 'agents', group_ids: [] })} data-testid="bc-agents" />
          {' '}The {chosen} agent{chosen === 1 ? '' : 's'} ticked in the Agents list{to?.length ? `: ${to.slice(0, 5).map(a => a.label).join(', ')}${to.length > 5 ? ` and ${to.length - 5} more` : ''}` : ''}</label>}
        <label className="choice"><input type="radio" checked={d.audience === 'all'} onChange={() => set({ audience: 'all', group_ids: [] })} data-testid="bc-all" /> Every agent</label>
        <label className="choice"><input type="radio" checked={d.audience === 'groups'} onChange={() => set({ audience: 'groups' })} data-testid="bc-groups" /> Chosen audience groups</label>
        {d.audience === 'groups' && (groups.length === 0 ? <small className="muted">No audience groups yet (make them in Market News → Audience groups).</small> : groups.map(g => (
          <label key={g.id} className="choice"><input type="checkbox" checked={d.group_ids.includes(g.id)}
            onChange={e => set({ group_ids: e.target.checked ? [...d.group_ids, g.id] : d.group_ids.filter(x => x !== g.id) })} data-testid="bc-group" /> {g.name}</label>)))}
      </fieldset>
      {langs.map(l => (
        <div key={l} className="stack">
          <b>{LANG_LABEL[l]}{l !== 'en' && <span className="muted small"> (optional; empty = English)</span>}</b>
          {d.channel === 'email' && <label className="field"><span>Subject</span>
            <input value={(d as Record<string, unknown>)[`subject_${l}`] as string ?? ''} maxLength={200} onChange={e => set({ [`subject_${l}`]: e.target.value } as Partial<BroadcastDraft>)} data-testid={`bc-subject-${l}`} /></label>}
          <label className="field"><span>Message</span>
            <textarea rows={4} value={(d as Record<string, unknown>)[`body_${l}`] as string ?? ''} maxLength={5000} onChange={e => set({ [`body_${l}`]: e.target.value } as Partial<BroadcastDraft>)} data-testid={`bc-body-${l}`} /></label>
        </div>
      ))}
      {problem && <small className="muted">{problem}</small>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={!!problem || busy} onClick={() => void save()} data-testid="bc-save">{busy ? 'Saving…' : 'Save draft'}</button></div>
    </div>
  );
}

export function BroadcastScreen({ id }: { id: string }) {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editBroadcasts');
  const [b, setB] = useState<Broadcast | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<BcPreview | null>(null);
  const [changing, setChanging] = useState(false);
  const [confirm, setConfirm] = useState<'queue' | 'cancel' | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<BroadcastSendResult | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setB(await api.broadcast(id)); } catch (e) { setErr(errText(e)); } }, [api, id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (b?.status === 'draft') api.broadcastPreview(id).then(setPreview).catch(() => setPreview(null)); }, [api, id, b?.status]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!b) return <Loading />;
  const live = b.status === 'queued' || b.status === 'sending';
  const send = async () => {
    setSending(true); setSendErr(null); setSent(null);
    try { if (!api.files.sendBroadcast) throw new Error('not available'); setSent(await api.files.sendBroadcast(b.id)); await load(); }
    catch (e) { setSendErr(errText(e)); } finally { setSending(false); }
  };
  return (
    <div className="stack" data-testid="broadcast">
      <div className="row"><h1 className="spacer">{b.ref}</h1><span className={`tag ${statusTag(b.status)}`} data-testid="bc-status">{BC_STATUS[b.status]}</span></div>
      <p className="muted small" style={{ margin: 0 }}>{b.channel === 'email' ? 'Email' : 'WhatsApp'} · {b.kind === 'news' ? 'News & offers' : 'Service notice'} ·
        {b.audience === 'all' ? ' every agent' : b.audience === 'agents' ? ` ${b.user_ids?.length ?? 0} chosen agent${b.user_ids?.length === 1 ? '' : 's'}` : ` ${b.group_ids.length} audience group${b.group_ids.length === 1 ? '' : 's'}`} · written by {b.created_by_email ?? '—'} {fmtTime(b.created_at)}
        {b.queued_at && <> · queued by {b.queued_by_email ?? '—'} {fmtTime(b.queued_at)}</>}</p>
      {changing ? <BroadcastEditor draft={b} onClose={() => setChanging(false)} onSaved={async () => { setChanging(false); await load(); }} /> : (
        <div className="card boxed stack">
          {b.channel === 'email' && <b>{b.subject_en}</b>}
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }} data-testid="bc-text">{b.body_en}</p>
          {(b.body_bm || b.body_zh) && <small className="muted">Also in {[b.body_bm && 'Bahasa Melayu', b.body_zh && '中文'].filter(Boolean).join(' and ')}.</small>}
        </div>
      )}
      {b.status === 'draft' && preview && (
        <div className="notice" data-testid="bc-preview">
          <b>{preview.reach}</b> agent{preview.reach === 1 ? '' : 's'} will get it now, of {preview.matched} in the audience.
          {preview.no_consent > 0 && <> {preview.no_consent} said no to news & offers.</>}
          {preview.no_address > 0 && <> {preview.no_address} have no {b.channel === 'email' ? 'email' : 'WhatsApp number'}.</>}
          {preview.not_active > 0 && <> {preview.not_active} account{preview.not_active === 1 ? ' is' : 's are'} not active.</>}
        </div>
      )}
      {edit && b.status === 'draft' && !changing && (
        <div className="row">
          <button className="btn" onClick={() => setChanging(true)} data-testid="bc-change">Change</button>
          <button className="btn" onClick={() => setConfirm('cancel')} data-testid="bc-cancel">Cancel broadcast</button>
          <span className="spacer" />
          <button className="btn gold" disabled={!preview || preview.reach === 0} onClick={() => setConfirm('queue')} data-testid="bc-queue">Make ready to send…</button>
        </div>
      )}
      {edit && live && (
        <div className="card boxed stack" data-testid="bc-send-box">
          {b.channel === 'email' ? <>
            <b>Send the emails</b>
            <small className="muted">Sent by the server with Resend. Until your own domain is verified in Resend, only your own Resend address can receive them; the others are shown as failed with Resend’s reason.</small>
            <div className="row"><button className="btn gold" disabled={sending} onClick={() => void send()} data-testid="bc-send">{sending ? 'Sending…' : b.status === 'sending' ? 'Send the rest' : 'Send now'}</button>
              <button className="btn" onClick={() => setConfirm('cancel')} disabled={b.status !== 'queued'} data-testid="bc-cancel">Cancel broadcast</button></div>
          </> : <>
            <b>Send on WhatsApp</b>
            <small className="muted">Tap-to-send: tap an agent below, WhatsApp opens with the message typed in, you press Send. Admin EAB records that you opened it (it cannot see whether you pressed Send).</small>
            <div className="row"><button className="btn" disabled={sending} onClick={() => void send()} data-testid="bc-send">{sending ? 'Sending…' : 'Send all with WhatsApp Business'}</button>
              <button className="btn" onClick={() => setConfirm('cancel')} disabled={b.status !== 'queued'} data-testid="bc-cancel">Cancel broadcast</button></div>
          </>}
        </div>
      )}
      {/* outside the send box: once everything is sent the broadcast is Done and the box closes, the result stays */}
      {sent && <p className="notice ok" role="status" data-testid="bc-sent">{sent.sent} sent, {sent.failed} failed.{sent.more ? ' Some are still waiting: press again to send the rest.' : ''}</p>}
      {sendErr && <p className="error" role="alert" data-testid="bc-send-error">{sendErr}</p>}
      <Recipients b={b} onChanged={() => void load()} />
      {confirm === 'queue' && preview && (
        <ConfirmDialog title="Make ready to send" confirmLabel="Make ready"
          body={<>This fixes the list now: <b>{preview.reach}</b> agent{preview.reach === 1 ? '' : 's'} by {b.channel === 'email' ? 'email' : 'WhatsApp'}
            {b.audience === 'all' ? ' — this is a broadcast to ALL agents' : ''}. The text cannot be changed after this.</>}
          onConfirm={async reason => { await api.broadcastQueue(b.id, reason); await load(); }} onClose={() => setConfirm(null)} />
      )}
      {confirm === 'cancel' && (
        <ConfirmDialog title="Cancel this broadcast" confirmLabel="Cancel broadcast" danger
          body={<>Nobody who has not been sent it yet will get it. It stays in the list for the record.</>}
          onConfirm={async reason => { await api.broadcastCancel(b.id, reason); await load(); }} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function Recipients({ b, onChanged }: { b: Broadcast; onChanged: () => void }) {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editBroadcasts');
  const [err, setErr] = useState<string | null>(null);
  const rs = b.recipients ?? [];
  if (!rs.length) return null;
  const tap = async (r: BcRecipient) => {
    setErr(null);
    const { body } = textFor(b, r.lang);
    const url = waLink(r.address ?? '', body);
    if (isNative()) void openInBrowser(url); else window.open(url, '_blank', 'noopener');
    try { await api.broadcastWaOpened(r.id); onChanged(); } catch (e) { setErr(errText(e)); }
  };
  const live = b.status === 'queued' || b.status === 'sending';
  return (
    <div className="stack">
      <h2>Who ({rs.length})</h2>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="tablewrap"><table data-testid="bc-recipients">
        <thead><tr><th>Agent</th><th>{b.channel === 'email' ? 'Email' : 'WhatsApp'}</th><th>Language</th><th>State</th><th /></tr></thead>
        <tbody>{rs.map(r => (
          <tr key={r.id} data-testid="bc-recipient">
            <td>{r.name ?? r.email}<br /><small className="muted">{r.email}</small></td>
            <td className="mono small">{b.channel === 'email' ? r.address : showPhone(r.address)}</td>
            <td>{LANG_LABEL[r.lang]}</td>
            <td><span className={`tag ${r.status === 'sent' || r.status === 'opened_wa' ? 'ok' : r.status === 'failed' ? 'red' : ''}`}>{RCP_STATUS[r.status]}</span>
              {r.error && <><br /><small className="error">{r.error}</small></>}
              {r.sent_at && <><br /><small className="muted">{fmtTime(r.sent_at)}{r.sent_by_email ? ` by ${r.sent_by_email}` : ''}</small></>}</td>
            <td>{edit && live && b.channel === 'whatsapp' && r.status === 'pending' && r.address &&
              <button className="btn small gold" onClick={() => void tap(r)} data-testid="bc-wa-open">Open WhatsApp</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
