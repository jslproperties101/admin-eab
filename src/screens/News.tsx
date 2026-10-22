// AdminBatch006 Part A — News & Announcements (features N, 63, 15, 44, Change G, Part1 pushed Projects).
// Writes go through the main app's MainForAdmin-D functions (role check, typed reason, Master Audit Log):
//   Market News · Projects · Announcements   write in EN / BM / ZH, picture, link, PDF, audience, end date, push alert,
//                                            preview, publish / withdraw, order per audience group (drag or type a number)
//   Audience groups                          named, ranked filters; how many agents match is shown before saving
//   Invitation codes                         for pushed Projects: create, disable, who used it, remove one agent's access
//   Push alerts                              send waiting alerts; sent / at least delivered / opened per post
// Owner and Admin change things; Compliance and Viewer only look.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NewsTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import {
  Audience, AudienceGroup, CodeGrant, EVERYONE, FeedDraft, FeedItem, FeedKind, GroupFilters, InviteCode, ProjectInfo, PushReport,
} from '../api/admin';
import {
  AUDIENCE_WORD, EMPTY_FILTER_FORM, FilterForm, KIND_ONE, KIND_TITLE, LANGS, LICENCES, PLATFORMS, STATUS_WORD, describeFilters, draftProblems,
  filterProblems, filtersToForm, formToFilters, fromLocalInput, mediaPath, mergeOrder, moveTo, placeAt, pushLine, sortGroups, toLocalInput,
} from '../admin/news';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

const TABS: { k: NewsTab; label: string }[] = [
  { k: 'news', label: 'Market News' }, { k: 'project', label: 'Projects' }, { k: 'announcement', label: 'Announcements' },
  { k: 'groups', label: 'Audience groups' }, { k: 'codes', label: 'Invitation codes' }, { k: 'push', label: 'Push alerts' },
];

export function NewsScreen({ tab: first }: { tab: NewsTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<NewsTab>(first);
  return (
    <div className="stack">
      <h1>News & Announcements</h1>
      {!can(me.role, 'editContent') && <p className="notice small" data-testid="read-only">Your role can look but not change anything here.</p>}
      <div className="tabs" role="group" aria-label="News & Announcements">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`ntab-${t.k}`}>{t.label}</button>)}
      </div>
      {(tab === 'news' || tab === 'project' || tab === 'announcement') && <PostsTab key={tab} kind={tab} />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'codes' && <CodesTab />}
      {tab === 'push' && <PushTab />}
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => { setErr(null); try { setData(await fn()); } catch (e) { setErr(errText(e)); } }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load, setData };
}

/** Asks for the reason (and a second confirmation) before running a change. */
function useConfirm() {
  const [c, setC] = useState<null | { title: string; body: ReactNode; label: string; danger?: boolean; run: (reason: string) => Promise<void> }>(null);
  const node = c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />;
  return { ask: setC, node };
}

const uuid = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16); });

// =====================================================================================================================
// Posts (one kind per tab)
// =====================================================================================================================
function PostsTab({ kind }: { kind: FeedKind }) {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editContent');
  const { data: items, err, load } = useLoad<FeedItem[]>(() => api.feedList(kind), [api, kind]);
  const { data: groups } = useLoad<AudienceGroup[]>(() => api.groups(), [api]);
  const { data: pushes, load: loadPush } = useLoad<PushReport[]>(() => api.pushList(), [api]);
  const [editing, setEditing] = useState<FeedItem | 'new' | { copy: FeedItem } | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const confirm = useConfirm();
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!items) return <Loading />;
  const pushOf = (id: string) => pushes?.find(p => p.item_id === id);
  const setStatus = (i: FeedItem, status: 'published' | 'withdrawn' | 'draft') => confirm.ask({
    title: status === 'published' ? `Publish this ${KIND_ONE[kind]}` : status === 'withdrawn' ? `Withdraw this ${KIND_ONE[kind]}` : 'Back to draft',
    body: <p><b>{i.title_en}</b><br />{status === 'published' ? `Agents in "${AUDIENCE_WORD[i.audience]}" will see it${i.push_alert ? ' and a push alert will be waiting to be sent' : ''}.`
      : status === 'withdrawn' ? 'It disappears from every agent at once (no archive on the phone). It stays here and in the audit log.' : 'Agents stop seeing it until it is published again.'}</p>,
    label: status === 'published' ? 'Publish' : status === 'withdrawn' ? 'Withdraw' : 'Back to draft', danger: status === 'withdrawn',
    run: async reason => { await api.feedSetStatus(i.id, status, reason); setMsg(`${STATUS_WORD[status]}: ${i.title_en}`); await load(); await loadPush(); },
  });
  return (
    <div className="stack" data-testid={`posts-${kind}`}>
      <div className="row">
        <h2 className="spacer">{KIND_TITLE[kind]} ({items.length})</h2>
        {edit && <button className="btn small" onClick={() => setOrdering(o => !o)} data-testid="order-open">{ordering ? 'Close order' : 'Order'}</button>}
        {edit && <button className="btn small gold" onClick={() => setEditing('new')} data-testid="post-new">New {KIND_ONE[kind]}</button>}
      </div>
      {msg && <p className="notice ok small" role="status" data-testid="post-msg">{msg}</p>}
      {ordering && groups && <OrderBox kind={kind} items={items} groups={groups} onDone={m => { setMsg(m); setOrdering(false); }} />}
      {editing && <PostEditor key={editing === 'new' ? 'new' : 'copy' in editing ? `copy-${editing.copy.id}` : editing.id} kind={kind}
        item={editing === 'new' || 'copy' in editing ? null : editing} copyFrom={editing !== 'new' && 'copy' in editing ? editing.copy : null} groups={groups ?? []}
        onClose={() => setEditing(null)} onSaved={async (m) => { setMsg(m); setEditing(null); await load(); await loadPush(); }} />}
      {items.length === 0 ? <p className="muted">Nothing yet. {edit ? `Press “New ${KIND_ONE[kind]}”.` : ''}</p> : (
        <div className="stack" data-testid="post-list">
          {items.map(i => {
            const p = pushOf(i.id);
            const expired = i.expires_at && new Date(i.expires_at).getTime() < Date.now();
            const later = i.status === 'published' && !!i.published_at && new Date(i.published_at).getTime() > Date.now();
            return (
              <div key={i.id} className="card post" data-testid="post-row">
                <div className="row">
                  <span className={`tag ${i.status === 'published' && !expired && !later ? 'ok' : i.status === 'withdrawn' ? 'red' : later ? 'amber' : ''}`} data-testid="post-state">
                    {expired && i.status === 'published' ? 'Ended' : later ? `Scheduled ${fmtTime(i.published_at)}` : STATUS_WORD[i.status]}</span>
                  {i.display && <span className="tag">{i.display === 'banner' ? 'Banner' : 'Pop-up'}</span>}
                  <span className="tag">{AUDIENCE_WORD[i.audience]}{i.audience === 'groups' ? `: ${i.group_ids.map(g => groups?.find(x => x.id === g)?.name ?? '?').join(', ')}` : ''}</span>
                  {i.push_alert && <span className="tag gold">Push alert</span>}
                </div>
                <b className="ptitle">{i.title_en}</b>
                {i.body_en && <p className="small muted clamp">{i.body_en}</p>}
                <small className="muted">
                  {i.published_at ? `Published ${fmtTime(i.published_at)}` : `Made ${fmtTime(i.created_at)}`}{i.expires_at ? ` · ends ${fmtTime(i.expires_at)}` : ''}
                  {' · '}opened by {i.opened ?? 0}{i.kind === 'announcement' ? ` · OK pressed ${i.acknowledged ?? 0} · closed ${i.dismissed ?? 0}` : ''}
                  {i.kind === 'project' && i.code_grants ? ` · ${i.code_grants} through codes` : ''}
                </small>
                {p && <small className="muted" data-testid="post-push">Push: {p.status === 'queued' ? 'waiting to be sent' : p.status === 'sending' ? 'sending…' : pushLine(p)}</small>}
                {edit && (
                  <div className="row">
                    <button className="btn small" onClick={() => setEditing(i)} data-testid="post-edit">Edit</button>
                    <button className="btn small" onClick={() => setEditing({ copy: i })} data-testid="post-copy">Copy</button>
                    {i.status !== 'published' && <button className="btn small gold" onClick={() => setStatus(i, 'published')} data-testid="post-publish">Publish</button>}
                    {i.status === 'published' && <button className="btn small danger" onClick={() => setStatus(i, 'withdrawn')} data-testid="post-withdraw">Withdraw</button>}
                    {i.status === 'withdrawn' && <button className="btn small" onClick={() => setStatus(i, 'draft')}>Back to draft</button>}
                    {p?.status === 'queued' && api.files.sendPush && <SendNow itemId={i.id} onDone={() => void loadPush()} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirm.node}
    </div>
  );
}

function SendNow({ itemId, onDone }: { itemId: string | null; onDone: () => void }) {
  const { api } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const confirm = useConfirm();
  const go = () => confirm.ask({
    title: itemId ? 'Send this push alert now' : 'Send every waiting push alert',
    body: <p>Each agent who can see the post gets one alert on their phone, in their language. It cannot be called back. Alerts are never sent twice.</p>,
    label: 'Send', danger: true,
    run: async () => {
      setBusy(true); setMsg(null);
      try {
        const r = await api.files.sendPush!(itemId);
        const sent = r.reduce((s, x) => s + (x.sent ?? 0), 0), skipped = r.filter(x => x.skipped).length;
        setMsg({ ok: true, t: r.length ? `Sent to ${sent} agent${sent === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (already sent or not due)` : ''}.` : 'Nothing was waiting.' });
        onDone();
      } catch (e) { setMsg({ ok: false, t: errText(e) }); throw e; } finally { setBusy(false); }
    },
  });
  return (
    <>
      <button className="btn small gold" disabled={busy} onClick={go} data-testid={itemId ? 'push-send-one' : 'push-send-all'}>{busy ? 'Sending…' : itemId ? 'Send alert now' : 'Send waiting alerts'}</button>
      {msg && <small className={msg.ok ? '' : 'error'} role="status" data-testid="push-msg">{msg.t}</small>}
      {confirm.node}
    </>
  );
}

// ---------------------------------------------------------------- the editor
type Lang = 'en' | 'bm' | 'zh';
const LANG_TAB: { k: Lang; label: string }[] = [{ k: 'en', label: 'English' }, { k: 'bm', label: 'BM' }, { k: 'zh', label: '中文' }];

function PostEditor({ kind, item, copyFrom, groups, onClose, onSaved }: {
  kind: FeedKind; item: FeedItem | null; copyFrom?: FeedItem | null; groups: AudienceGroup[]; onClose: () => void; onSaved: (msg: string) => Promise<void> | void;
}) {
  const { api } = useAdmin();
  const src = item ?? copyFrom ?? null;
  const [at, setAt] = useState('');
  const [d, setD] = useState<FeedDraft>(() => src
    ? { ...(item ? { id: item.id } : {}), kind, title_en: item ? src.title_en : `${src.title_en} (copy)`.slice(0, 200), title_bm: src.title_bm, title_zh: src.title_zh, body_en: src.body_en, body_bm: src.body_bm, body_zh: src.body_zh,
        image_url: src.image_url, link_url: src.link_url, pdf_url: src.pdf_url, push_alert: src.push_alert, display: src.display,
        project: src.project, audience: src.audience, expires_at: item ? src.expires_at : null, group_ids: src.group_ids }
    : { kind, title_en: '', audience: 'all', push_alert: false, display: kind === 'announcement' ? 'banner' : null, group_ids: [], project: kind === 'project' ? {} : null });
  const [lang, setLang] = useState<Lang>('en');
  const [preview, setPreview] = useState<Lang | null>(null);
  const [touched, setTouched] = useState(false);
  const confirm = useConfirm();
  const problems = draftProblems(d);
  const set = (p: Partial<FeedDraft>) => setD(x => ({ ...x, ...p }));
  const setProject = (p: Partial<ProjectInfo>) => setD(x => ({ ...x, project: { ...(x.project ?? {}), ...p } }));
  const tk = `title_${lang}` as const, bk = `body_${lang}` as const;
  const atIso = fromLocalInput(at);
  const atBad = !!at && (!atIso || new Date(atIso).getTime() < Date.now() - 60_000 || (!!d.expires_at && new Date(d.expires_at).getTime() <= new Date(atIso).getTime()));
  const schedule = () => {
    setTouched(true);
    if (problems.length || !atIso || atBad) return;
    confirm.ask({
      title: `Schedule this ${KIND_ONE[kind]}`,
      body: <p><b>{d.title_en}</b><br />Agents in "{AUDIENCE_WORD[d.audience ?? 'all']}" see it from <b>{at.replace('T', ' ')}</b> (Malaysia time).{d.push_alert ? ' The push alert waits until then.' : ''}</p>,
      label: 'Save and schedule',
      run: async reason => {
        const clean: FeedDraft = { ...d, project: kind === 'project' ? d.project ?? {} : null, display: kind === 'announcement' ? d.display : null, group_ids: d.audience === 'groups' ? d.group_ids : [] };
        const saved = await api.feedSave(clean, reason);
        await api.feedSchedule(saved.id, atIso, reason);
        await onSaved(`Scheduled for ${at.replace('T', ' ')}: ${saved.title_en}`);
      },
    });
  };
  const save = (publish: boolean) => {
    setTouched(true);
    if (problems.length) return;
    confirm.ask({
      title: publish ? `Save and publish this ${KIND_ONE[kind]}` : `Save this ${KIND_ONE[kind]}`,
      body: <p><b>{d.title_en}</b><br />{publish ? `Agents in "${AUDIENCE_WORD[d.audience ?? 'all']}" will see it.` : item?.status === 'published' ? 'It is already published: agents see the change at once.' : 'Saved as a draft; agents do not see it yet.'}
        {publish && d.push_alert ? ' A push alert will be waiting; send it from this screen.' : ''}</p>,
      label: publish ? 'Save and publish' : 'Save',
      run: async reason => {
        const clean: FeedDraft = { ...d, project: kind === 'project' ? d.project ?? {} : null, display: kind === 'announcement' ? d.display : null,
          group_ids: d.audience === 'groups' ? d.group_ids : [] };
        const saved = await api.feedSave(clean, reason);
        if (publish && saved.status !== 'published') await api.feedSetStatus(saved.id, 'published', reason);
        await onSaved(`${publish ? 'Published' : 'Saved'}: ${saved.title_en}`);
      },
    });
  };
  return (
    <div className="card boxed stack editor" data-testid="post-editor">
      <div className="row"><h3 className="spacer">{item ? 'Edit' : copyFrom ? 'Copy of a' : 'New'} {KIND_ONE[kind]}</h3><button className="btn small" onClick={onClose}>Cancel</button></div>
      <div className="tabs" role="group" aria-label="Language" style={{ margin: 0 }}>
        {LANG_TAB.map(l => <button key={l.k} aria-pressed={lang === l.k} onClick={() => setLang(l.k)} data-testid={`lang-${l.k}`}>
          {l.label}{l.k !== 'en' && !(d[`title_${l.k}` as const] ?? '').trim() ? ' (empty → English)' : ''}</button>)}
      </div>
      <label className="field"><span>Title ({LANG_TAB.find(l => l.k === lang)!.label}){lang === 'en' ? ' — needed' : ''}</span>
        <input value={d[tk] ?? ''} maxLength={200} onChange={e => set({ [tk]: e.target.value } as Partial<FeedDraft>)} data-testid={`title-${lang}`} /></label>
      <label className="field"><span>Text ({LANG_TAB.find(l => l.k === lang)!.label})</span>
        <textarea rows={6} value={d[bk] ?? ''} maxLength={10000} onChange={e => set({ [bk]: e.target.value } as Partial<FeedDraft>)} data-testid={`body-${lang}`} /></label>
      {kind === 'announcement' && (
        <fieldset className="field"><span>Shown as</span>
          <div className="row">
            <label className="choice"><input type="radio" checked={d.display === 'banner'} onChange={() => set({ display: 'banner' })} data-testid="display-banner" /> Banner at the top of the home screen (closable)</label>
            <label className="choice"><input type="radio" checked={d.display === 'popup'} onChange={() => set({ display: 'popup' })} data-testid="display-popup" /> Full-screen pop-up (needs “OK, got it”)</label>
          </div>
        </fieldset>
      )}
      {kind === 'project' && (
        <div className="grid2">
          <label className="field"><span>Developer</span><input value={d.project?.developer ?? ''} onChange={e => setProject({ developer: e.target.value })} /></label>
          <label className="field"><span>Location</span><input value={d.project?.location ?? ''} onChange={e => setProject({ location: e.target.value })} /></label>
          <label className="field"><span>Price from (RM)</span><input inputMode="numeric" value={d.project?.price_from ?? ''} onChange={e => setProject({ price_from: e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : null })} /></label>
          <label className="field"><span>Price to (RM)</span><input inputMode="numeric" value={d.project?.price_to ?? ''} onChange={e => setProject({ price_to: e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, '')) : null })} /></label>
          <label className="field"><span>Launch</span><input value={d.project?.launch ?? ''} placeholder="e.g. Q1 2027" onChange={e => setProject({ launch: e.target.value })} /></label>
          <label className="field"><span>Project status</span><input value={d.project?.status ?? ''} placeholder="e.g. Under construction" onChange={e => setProject({ status: e.target.value })} /></label>
        </div>
      )}
      <MediaField label="Picture" want="image" value={d.image_url ?? ''} onChange={v => set({ image_url: v || null })} testid="image" />
      <label className="field"><span>Website link (https://…)</span><input value={d.link_url ?? ''} onChange={e => set({ link_url: e.target.value || null })} data-testid="link" /></label>
      <MediaField label="PDF" want="pdf" value={d.pdf_url ?? ''} onChange={v => set({ pdf_url: v || null })} testid="pdf" />
      <fieldset className="field"><span>Who sees it</span>
        <div className="row">
          {(['all', 'groups', ...(kind === 'project' ? ['codes'] : [])] as const).map(a => (
            <label key={a} className="choice"><input type="radio" checked={d.audience === a} onChange={() => set({ audience: a as Audience })} data-testid={`aud-${a}`} /> {AUDIENCE_WORD[a]}</label>
          ))}
        </div>
      </fieldset>
      {d.audience === 'groups' && (
        <div className="checks" data-testid="aud-groups">
          {sortGroups(groups).filter(g => g.id !== EVERYONE && g.active).map(g => (
            <label key={g.id} className="choice"><input type="checkbox" checked={d.group_ids?.includes(g.id) ?? false}
              onChange={e => set({ group_ids: e.target.checked ? [...(d.group_ids ?? []), g.id] : (d.group_ids ?? []).filter(x => x !== g.id) })} />
              {' '}{g.name} <small className="muted">({g.agents ?? 0} agents · {describeFilters(g.filters)})</small></label>
          ))}
          {!groups.some(g => g.id !== EVERYONE) && <p className="muted small">No groups yet: make one in “Audience groups”.</p>}
        </div>
      )}
      {d.audience === 'codes' && <p className="muted small">Only agents who type an invitation code for this project see it. Make the code in “Invitation codes” after saving.</p>}
      <div className="grid2">
        {item?.status !== 'published' && <label className="field"><span>Publish later at (optional, Malaysia time)</span>
          <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} data-testid="publish-at" />
          {atBad && <small className="error">Pick a time from now on, before the end date.</small>}</label>}
        <label className="field"><span>Ends on (optional, Malaysia time)</span>
          <input type="datetime-local" value={toLocalInput(d.expires_at)} onChange={e => set({ expires_at: fromLocalInput(e.target.value) })} data-testid="expires" /></label>
        <label className="choice switch"><input type="checkbox" checked={!!d.push_alert} onChange={e => set({ push_alert: e.target.checked })} data-testid="push-alert" />
          {' '}Send a push alert when published</label>
      </div>
      {touched && problems.length > 0 && <ul className="error small" data-testid="post-problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <div className="row">
        <button className="btn" onClick={() => setPreview(preview ? null : lang)} data-testid="preview">{preview ? 'Hide preview' : 'Preview'}</button>
        <span className="spacer" />
        <button className="btn" onClick={() => save(false)} data-testid="post-save">Save</button>
        {item?.status !== 'published' && (at
          ? <button className="btn gold" disabled={atBad} onClick={schedule} data-testid="post-schedule">Save and schedule</button>
          : <button className="btn gold" onClick={() => save(true)} data-testid="post-save-publish">Save and publish</button>)}
      </div>
      {preview && <Preview d={d} lang={preview} onLang={setPreview} />}
      {confirm.node}
    </div>
  );
}

/** Upload a file (Owner / Admin) or paste a link. */
function MediaField({ label, want, value, onChange, testid }: { label: string; want: 'image' | 'pdf'; value: string; onChange: (v: string) => void; testid: string }) {
  const { api } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    const p = mediaPath(f, want, uuid());
    if ('error' in p) { setErr(p.error); return; }
    setBusy(true);
    try { onChange(await api.files.media!(p.path, f)); } catch (e) { setErr(errText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (
    <div className="field">
      <span>{label} — upload, or paste a link (https://…)</span>
      <div className="row">
        <input className="spacer" value={value} onChange={e => onChange(e.target.value)} placeholder="https://" data-testid={`${testid}-url`} />
        {api.files.media && <>
          <button className="btn small" type="button" disabled={busy} onClick={() => input.current?.click()} data-testid={`${testid}-upload`}>{busy ? 'Uploading…' : 'Upload'}</button>
          <input ref={input} type="file" hidden accept={want === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'} onChange={e => void pick(e.target.files?.[0])} data-testid={`${testid}-file`} />
        </>}
        {value && <button className="btn small" type="button" onClick={() => onChange('')}>Remove</button>}
      </div>
      {want === 'image' && value && /^https:\/\//.test(value) && <img src={value} alt="" className="thumb" />}
      {err && <small className="error" role="alert">{err}</small>}
      <small className="muted">Uploaded files are public (agents open them by link) and cannot be replaced or deleted. Max 10 MB.</small>
    </div>
  );
}

function Preview({ d, lang, onLang }: { d: FeedDraft; lang: Lang; onLang: (l: Lang) => void }) {
  const t = (d[`title_${lang}` as const] ?? '').trim() || d.title_en;
  const b = (d[`body_${lang}` as const] ?? '').trim() || d.body_en || '';
  return (
    <div className="stack" data-testid="preview-box">
      <div className="tabs" role="group" aria-label="Preview language" style={{ margin: 0 }}>
        {LANG_TAB.map(l => <button key={l.k} aria-pressed={lang === l.k} onClick={() => onLang(l.k)}>{l.label}</button>)}
      </div>
      <div className={`phone ${d.kind === 'announcement' && d.display === 'popup' ? 'popup' : ''}`}>
        {d.kind === 'announcement' && d.display === 'banner' ? (
          <div className="pv-banner"><b>{t}</b><span className="small">{b.slice(0, 140)}</span><span className="x">×</span></div>
        ) : (
          <div className="pv-card">
            {d.image_url && <img src={d.image_url} alt="" />}
            <b>{t}</b>
            {d.kind === 'project' && d.project && <small className="muted">{[d.project.developer, d.project.location, d.project.launch].filter(Boolean).join(' · ')}
              {d.project.price_from ? ` · from RM ${Number(d.project.price_from).toLocaleString()}` : ''}</small>}
            <p className="small">{b}</p>
            <div className="row small">{d.link_url && <span className="gold">Open website ↗</span>}{d.pdf_url && <span className="gold">Open PDF ↗</span>}</div>
            {d.kind === 'announcement' && <span className="btn small gold">OK, got it</span>}
          </div>
        )}
      </div>
      <small className="muted">A preview of how an agent sees it in {LANG_TAB.find(l => l.k === lang)!.label}. Empty BM / Chinese shows the English.</small>
    </div>
  );
}

// ---------------------------------------------------------------- order per group (Change G)
function OrderBox({ kind, items, groups, onDone }: { kind: FeedKind; items: FeedItem[]; groups: AudienceGroup[]; onDone: (m: string) => void }) {
  const { api } = useAdmin();
  const ranked = sortGroups(groups);
  const [group, setGroup] = useState<string>(EVERYONE);
  const live = useMemo(() => items.filter(i => i.status !== 'withdrawn'), [items]);
  const [saved, setSaved] = useState<{ item_id: string; position: number }[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const confirm = useConfirm();
  useEffect(() => {
    let on = true; setSaved(null); setErr(null);
    api.orderGet(group).then(s => { if (!on) return; setSaved(s); setOrder(mergeOrder(s, live)); }).catch(e => on && setErr(errText(e)));
    return () => { on = false; };
  }, [api, group, live]);
  const title = (id: string) => live.find(i => i.id === id)?.title_en ?? '?';
  // Drag with mouse or finger: the handle captures the pointer; the row under the pointer is where it goes.
  const onMove = (e: { clientX: number; clientY: number }) => {
    if (drag === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-idx]') as HTMLElement | null;
    const to = el ? Number(el.dataset.idx) : null;
    if (to !== null && to !== drag) { setOrder(o => moveTo(o, drag, to)); setDrag(to); }
  };
  const save = () => confirm.ask({
    title: `Save the order of ${KIND_TITLE[kind]} for “${ranked.find(g => g.id === group)?.name}”`,
    body: <ol className="small">{order.map(id => <li key={id}>{title(id)}</li>)}</ol>,
    label: 'Save order',
    run: async reason => {
      // The order is kept per group for all kinds together: keep the other kinds' places as they were.
      const others = (saved ?? []).sort((a, b) => a.position - b.position).map(s => s.item_id).filter(id => !items.some(i => i.id === id));
      await api.orderSet(group, [...order, ...others], reason);
      onDone(`Order saved for “${ranked.find(g => g.id === group)?.name}”.`);
    },
  });
  return (
    <div className="card boxed stack" data-testid="order-box">
      <h3>Order of {KIND_TITLE[kind]}</h3>
      <label className="field"><span>For the group (an agent in several groups sees the order of their highest-ranked group)</span>
        <select value={group} onChange={e => setGroup(e.target.value)} data-testid="order-group">
          {ranked.map(g => <option key={g.id} value={g.id}>{g.priority === 1000 ? '' : `#${g.priority} `}{g.name}</option>)}
        </select></label>
      {err ? <ErrorBox text={err} /> : !saved ? <Loading /> : order.length === 0 ? <p className="muted">Nothing to order.</p> : (
        <ol className="orderlist" onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} data-testid="order-list">
          {order.map((id, i) => (
            <li key={id} data-idx={i} className={drag === i ? 'dragging' : ''} data-testid="order-row">
              <span className="handle" aria-label="Drag to move" onPointerDown={(e: { target: EventTarget; pointerId: number }) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(i); }}>⠿</span>
              <span className="spacer">{title(id)}</span>
              <input aria-label={`Position of ${title(id)}`} className="pos" inputMode="numeric" defaultValue={i + 1} key={`${id}-${i}`}
                onKeyDown={e => { if (e.key === 'Enter') { const r = placeAt(order, i, (e.target as HTMLInputElement).value); if (r) setOrder(r); } }}
                onBlur={e => { const r = placeAt(order, i, e.target.value); if (r && r.join() !== order.join()) setOrder(r); }} data-testid="order-pos" />
              <button className="btn small" aria-label="Up" disabled={i === 0} onClick={() => setOrder(o => moveTo(o, i, i - 1))}>↑</button>
              <button className="btn small" aria-label="Down" disabled={i === order.length - 1} onClick={() => setOrder(o => moveTo(o, i, i + 1))}>↓</button>
            </li>
          ))}
        </ol>
      )}
      <small className="muted">Drag ⠿ with the mouse or a finger, or type a position number (1 = first) and press Enter.</small>
      <div className="row"><span className="spacer" /><button className="btn gold" onClick={save} disabled={!saved || !order.length} data-testid="order-save">Save order</button></div>
      {confirm.node}
    </div>
  );
}

// =====================================================================================================================
// Audience groups
// =====================================================================================================================
function GroupsTab() {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editContent');
  const { data: groups, err, load } = useLoad<AudienceGroup[]>(() => api.groups(), [api]);
  const [editing, setEditing] = useState<AudienceGroup | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!groups) return <Loading />;
  return (
    <div className="stack" data-testid="groups">
      <div className="row"><h2 className="spacer">Audience groups</h2>{edit && <button className="btn small gold" onClick={() => setEditing('new')} data-testid="group-new">New group</button>}</div>
      <p className="muted small" style={{ margin: 0 }}>Rank 1 is the highest. An agent in two groups sees the order of the higher-ranked one. “Everyone” is always last.</p>
      {msg && <p className="notice ok small" role="status">{msg}</p>}
      {editing && <GroupEditor group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async m => { setMsg(m); setEditing(null); await load(); }} />}
      <div className="tablewrap dash-table">
        <table data-testid="group-list">
          <thead><tr><th>Rank</th><th>Group</th><th>Who</th><th>Agents now</th><th /></tr></thead>
          <tbody>{sortGroups(groups).map(g => (
            <tr key={g.id} className={g.active ? '' : 'muted'}>
              <td>{g.id === EVERYONE ? 'last' : g.priority}</td>
              <td><b>{g.name}</b>{!g.active && <> <span className="tag">Off</span></>}</td>
              <td className="small">{describeFilters(g.filters)}</td>
              <td>{g.agents ?? '—'}</td>
              <td>{edit && g.id !== EVERYONE && <button className="btn small" onClick={() => setEditing(g)} data-testid="group-edit">Edit</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function GroupEditor({ group, onClose, onSaved }: { group: AudienceGroup | null; onClose: () => void; onSaved: (m: string) => Promise<void> | void }) {
  const { api } = useAdmin();
  const [name, setName] = useState(group?.name ?? '');
  const [rank, setRank] = useState(String(group?.priority ?? 10));
  const [active, setActive] = useState(group?.active ?? true);
  const [form, setForm] = useState<FilterForm>(() => (group ? filtersToForm(group.filters) : EMPTY_FILTER_FORM));
  const [count, setCount] = useState<{ agents: number; of: number } | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);
  const confirm = useConfirm();
  const problems = filterProblems(form);
  const rankN = Number(rank);
  const rankBad = !(Number.isInteger(rankN) && rankN >= 1 && rankN <= 999);
  const filters: GroupFilters = useMemo(() => formToFilters(form), [form]);
  const key = JSON.stringify(filters);
  useEffect(() => {
    if (problems.length) return;
    let on = true; setCountErr(null);
    const t = window.setTimeout(() => { api.groupPreview(filters).then(c => on && setCount(c)).catch(e => on && setCountErr(errText(e))); }, 400);
    return () => { on = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, problems.length]);
  const set = (p: Partial<FilterForm>) => setForm(f => ({ ...f, ...p }));
  const toggle = (k: 'licence_types' | 'languages' | 'platforms', v: string) => set({ [k]: form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v] } as Partial<FilterForm>);
  const ok = name.trim() && !problems.length && !rankBad;
  const save = () => confirm.ask({
    title: group ? `Save group “${name.trim()}”` : `Make group “${name.trim()}”`,
    body: <p>{describeFilters(filters)}<br />{count ? `${count.agents} of ${count.of} agents match now.` : ''} Rank {rankN}.</p>,
    label: 'Save group',
    run: async reason => {
      await api.groupSave({ ...(group ? { id: group.id } : {}), name: name.trim(), priority: rankN, active, filters }, reason);
      await onSaved(`Group saved: ${name.trim()}`);
    },
  });
  const chips = (k: 'licence_types' | 'languages' | 'platforms', opts: { v: string; label: string }[]) => (
    <div className="row">{opts.map(o => <label key={o.v} className="choice"><input type="checkbox" checked={form[k].includes(o.v)} onChange={() => toggle(k, o.v)} data-testid={`f-${k}-${o.v}`} /> {o.label}</label>)}</div>
  );
  return (
    <div className="card boxed stack" data-testid="group-editor">
      <div className="row"><h3 className="spacer">{group ? 'Edit group' : 'New group'}</h3><button className="btn small" onClick={onClose}>Cancel</button></div>
      <div className="grid2">
        <label className="field"><span>Name</span><input value={name} maxLength={120} onChange={e => setName(e.target.value)} data-testid="group-name" /></label>
        <label className="field"><span>Rank (1 = highest)</span><input inputMode="numeric" value={rank} onChange={e => setRank(e.target.value)} data-testid="group-rank" /></label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Leave a filter empty to ignore it. Every filter you fill in must match.</p>
      <label className="field"><span>Emails (comma or new line)</span><textarea rows={2} value={form.emails} onChange={e => set({ emails: e.target.value })} data-testid="f-emails" /></label>
      <label className="field"><span>Countries (comma)</span><input value={form.countries} placeholder="Malaysia" onChange={e => set({ countries: e.target.value })} /></label>
      <div className="field"><span>Licence type</span>{chips('licence_types', LICENCES)}</div>
      <div className="field"><span>Language</span>{chips('languages', LANGS)}</div>
      <div className="field"><span>Platform</span>{chips('platforms', PLATFORMS)}</div>
      <label className="field"><span>App versions (comma)</span><input value={form.app_versions} placeholder="2.2.0" onChange={e => set({ app_versions: e.target.value })} /></label>
      <div className="grid2">
        <label className="field"><span>Joined from</span><input type="date" value={form.joined_from} onChange={e => set({ joined_from: e.target.value })} /></label>
        <label className="field"><span>Joined to</span><input type="date" value={form.joined_to} onChange={e => set({ joined_to: e.target.value })} /></label>
        <label className="field"><span>Last sign-in from</span><input type="date" value={form.last_login_from} onChange={e => set({ last_login_from: e.target.value })} /></label>
        <label className="field"><span>Last sign-in to</span><input type="date" value={form.last_login_to} onChange={e => set({ last_login_to: e.target.value })} /></label>
        <label className="field"><span>At least this many sign-ins</span><input inputMode="numeric" value={form.min_logins} onChange={e => set({ min_logins: e.target.value })} /></label>
        <label className="choice switch"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Group is on</label>
      </div>
      {problems.length > 0 && <ul className="error small">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {rankBad && <p className="error small">Rank must be a whole number from 1 to 999.</p>}
      <p className="notice small" data-testid="group-count">{countErr ? countErr : count ? <><b>{count.agents}</b> of {count.of} agents match these filters now.</> : 'Counting…'}</p>
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={!ok} onClick={save} data-testid="group-save">Save group</button></div>
      {confirm.node}
    </div>
  );
}

// =====================================================================================================================
// Invitation codes (pushed Projects)
// =====================================================================================================================
function CodesTab() {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editContent');
  const names = can(me.role, 'viewTickets');   // owner / admin / compliance (the grants list names agents)
  const { data: codes, err, load } = useLoad<InviteCode[]>(() => api.codes(), [api]);
  const { data: projects } = useLoad<FeedItem[]>(() => api.feedList('project'), [api]);
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [made, setMade] = useState<InviteCode | null>(null);
  const confirm = useConfirm();
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!codes) return <Loading />;
  const title = (id: string) => projects?.find(p => p.id === id)?.title_en ?? 'project';
  return (
    <div className="stack" data-testid="codes">
      <div className="row"><h2 className="spacer">Invitation codes</h2>{edit && <button className="btn small gold" onClick={() => setMaking(true)} data-testid="code-new">New code</button>}</div>
      <p className="muted small" style={{ margin: 0 }}>An agent types the code in Projects to see projects shared “by invitation code only”. 20 wrong tries per hour, then a wait.</p>
      {made && <div className="notice ok" data-testid="code-made">New code: <b className="code">{made.code}</b> — give it to the team leader or agents.</div>}
      {making && projects && <CodeMaker projects={projects} onClose={() => setMaking(false)} onMade={async c => { setMade(c); setMaking(false); await load(); }} />}
      {codes.length === 0 ? <p className="muted">No codes yet.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="code-list">
            <thead><tr><th>Code</th><th>Projects</th><th>Used</th><th>Ends</th><th>State</th><th /></tr></thead>
            <tbody>{codes.map(c => {
              const ended = (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) || (c.max_uses !== null && c.uses >= c.max_uses);
              return (
                <tr key={c.code}>
                  <td><b className="code">{c.code}</b>{c.label && <><br /><small className="muted">{c.label}</small></>}</td>
                  <td className="small">{c.item_ids.map(title).join(', ')}</td>
                  <td>{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ''} <small className="muted">({c.agents} agents)</small></td>
                  <td className="small">{c.expires_at ? fmtTime(c.expires_at) : 'no end'}</td>
                  <td>{!c.active ? <span className="tag red">Disabled</span> : ended ? <span className="tag">Used up / ended</span> : <span className="tag ok">Active</span>}</td>
                  <td className="row">
                    {names && <button className="btn small" onClick={() => setOpen(open === c.code ? null : c.code)} data-testid="code-who">Who used it</button>}
                    {edit && c.active && <button className="btn small danger" data-testid="code-disable" onClick={() => confirm.ask({
                      title: `Disable code ${c.code}`, body: <p>Nobody can use it any more. Agents who already used it keep their projects (remove them one by one in “Who used it”).</p>,
                      label: 'Disable', danger: true, run: async reason => { await api.codeDisable(c.code, reason); await load(); } })}>Disable</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {open && <CodeGrants code={open} />}
      {confirm.node}
    </div>
  );
}

function CodeMaker({ projects, onClose, onMade }: { projects: FeedItem[]; onClose: () => void; onMade: (c: InviteCode) => Promise<void> | void }) {
  const { api } = useAdmin();
  const [label, setLabel] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [ends, setEnds] = useState('');
  const [max, setMax] = useState('');
  const confirm = useConfirm();
  const live = projects.filter(p => p.status !== 'withdrawn');
  const maxN = max.trim() ? Number(max) : null;
  const ok = pick.length > 0 && (maxN === null || (Number.isInteger(maxN) && maxN >= 1));
  return (
    <div className="card boxed stack" data-testid="code-maker">
      <div className="row"><h3 className="spacer">New invitation code</h3><button className="btn small" onClick={onClose}>Cancel</button></div>
      <label className="field"><span>Note (who it is for)</span><input value={label} maxLength={200} onChange={e => setLabel(e.target.value)} data-testid="code-label" /></label>
      <div className="field"><span>Projects in this code</span>
        {live.length === 0 ? <p className="muted small">No projects yet: add one in Projects first.</p> : live.map(p => (
          <label key={p.id} className="choice"><input type="checkbox" checked={pick.includes(p.id)} onChange={e => setPick(e.target.checked ? [...pick, p.id] : pick.filter(x => x !== p.id))} data-testid="code-project" /> {p.title_en} <small className="muted">({STATUS_WORD[p.status]})</small></label>
        ))}</div>
      <div className="grid2">
        <label className="field"><span>Ends on (optional)</span><input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} /></label>
        <label className="field"><span>Most uses (optional)</span><input inputMode="numeric" value={max} onChange={e => setMax(e.target.value)} data-testid="code-max" /></label>
      </div>
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={!ok} data-testid="code-create" onClick={() => confirm.ask({
        title: 'Make an invitation code', body: <p>{pick.length} project{pick.length === 1 ? '' : 's'}{maxN ? ` · at most ${maxN} uses` : ''}{ends ? ` · ends ${ends.replace('T', ' ')}` : ''}.</p>,
        label: 'Make code', run: async reason => { await onMade(await api.codeCreate(label.trim(), pick, fromLocalInput(ends), maxN, reason)); } })}>Make code</button></div>
      {confirm.node}
    </div>
  );
}

function CodeGrants({ code }: { code: string }) {
  const { api, me } = useAdmin();
  const { data, err, load } = useLoad<CodeGrant[]>(() => api.codeGrants(code), [api, code]);
  const confirm = useConfirm();
  return (
    <div className="card stack" data-testid="code-grants">
      <h3>Who used {code}</h3>
      <small className="muted">Opening this list is recorded.</small>
      {err ? <ErrorBox text={err} /> : !data ? <Loading /> : data.length === 0 ? <p className="muted">Nobody yet.</p> : (
        <div className="tablewrap dash-table"><table>
          <thead><tr><th>Agent</th><th>Project</th><th>Since</th><th /></tr></thead>
          <tbody>{data.map(g => (
            <tr key={`${g.user_id}/${g.item_id}`}><td>{g.name ?? g.email}<br /><small className="muted">{g.email}</small></td><td>{g.title}</td><td className="small">{fmtTime(g.granted_at)}</td>
              <td>{can(me.role, 'editContent') && <button className="btn small danger" data-testid="grant-revoke" onClick={() => confirm.ask({
                title: 'Remove this agent’s access', body: <p>{g.email} stops seeing “{g.title}”. The code itself stays.</p>, label: 'Remove access', danger: true,
                run: async reason => { await api.codeRevoke(g.user_id, g.item_id, reason); await load(); } })}>Remove access</button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {confirm.node}
    </div>
  );
}

// =====================================================================================================================
// Push alerts (features 15, 44)
// =====================================================================================================================
function PushTab() {
  const { api, me } = useAdmin();
  const { data, err, load } = useLoad<PushReport[]>(() => api.pushList(), [api]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const waiting = data.filter(p => p.status === 'queued').length;
  return (
    <div className="stack" data-testid="push">
      <div className="row">
        <h2 className="spacer">Push alerts</h2>
        {can(me.role, 'editContent') && api.files.sendPush && <SendNow itemId={null} onDone={() => void load()} />}
        <button className="btn small" onClick={() => void load()}>Refresh</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>{waiting} waiting to be sent. A post published with “Send a push alert” on waits here until it is sent; it is never sent twice.
        “Delivered” is at least this many: Android shows an alert by itself when the app is closed and only tells us if the agent taps it.</p>
      {data.length === 0 ? <p className="muted">No post has had a push alert yet.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="push-list">
            <thead><tr><th>Post</th><th>State</th><th>Sent</th><th>Delivered (at least)</th><th>Opened</th><th>Failed / no phone</th></tr></thead>
            <tbody>{data.map(p => (
              <tr key={p.item_id}>
                <td><b>{p.title_en}</b><br /><small className="muted">{p.kind ? KIND_ONE[p.kind] : ''} · queued {fmtTime(p.queued_at)}</small></td>
                <td>{p.status === 'queued' ? <span className="tag amber">Waiting</span> : p.status === 'sending' ? <span className="tag">Sending</span> : <span className="tag ok">Done</span>}</td>
                <td>{p.sent ?? '—'}{p.targeted != null ? <small className="muted"> of {p.targeted}</small> : ''}</td>
                <td>{p.status === 'done' ? p.delivered : '—'}</td>
                <td>{p.status === 'done' ? p.opened : '—'}</td>
                <td>{p.failed ?? 0} / {p.no_phone ?? 0}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
