// AdminBatch010: one screen for every list in AI Buddy POS, On Da Way, MM2H and AI Buddy Biz.
// Totals on top, then the list. Search and a period where they apply. Excel export for Owner / Compliance (the export
// is registered in the access log first). Changes (ticket status, PDPA requests, flags, content, Biz modules and admins)
// always ask for a reason and a second confirmation; the database checks the role and writes the action log.
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { can } from '../admin/roles';
import { AppCalls, AppViewResult, ContentItem, NO_PERIOD, OtherApp, cellText, columnsOf, flatRow, heading } from '../api/apps';
import { bizApi, useBiz } from '../api/biz';
import { buildXlsx, XLSX_MIME } from '../export/xlsx';
import { saveLocally } from '../export/pack';
import { ConfirmDialog, ErrorBox, Loading } from './ui';
import { BizGate } from './BizGate';

const day = (d: Date) => d.toISOString().slice(0, 10);

export function AppDataScreen({ app, view, title }: { app: OtherApp; view: string; title: string }) {
  if (app === 'biz') return <BizGate><BizData view={view} title={title} /></BizGate>;
  return <EabData app={app} view={view} title={title} />;
}
function EabData({ app, view, title }: { app: Exclude<OtherApp, 'biz'>; view: string; title: string }) {
  const { apps, me } = useAdmin();
  return <DataList calls={apps} role={me.role} email={me.email} app={app} view={view} title={title} />;
}
function BizData({ view, title }: { view: string; title: string }) {
  const { device } = useAdmin();
  const biz = useBiz();
  const calls = useMemo(() => bizApi(device), [device]);
  return <DataList calls={calls} role={biz.me!.role} email={biz.me!.email} app="biz" view={view} title={title} />;
}

type Pending = { title: string; body: string; label: string; danger?: boolean; run: (reason: string) => Promise<unknown> };

function DataList({ calls, role, email, app, view, title }: { calls: AppCalls; role: string; email: string; app: OtherApp; view: string; title: string }) {
  const { api, go } = useAdmin();
  const period = !NO_PERIOD.has(view) && !view.startsWith('content:');
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(() => day(new Date()));
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState({ from, to, q: '' });
  const [res, setRes] = useState<AppViewResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; item: ContentItem } | null>(null);
  const [newFlag, setNewFlag] = useState({ key: '', label: '' });
  const [newAdmin, setNewAdmin] = useState({ email: '', role: 'viewer' });

  const r = role as Parameters<typeof can>[0];
  const manage = can(r, 'appManage');
  const exportOk = role === 'owner' || role === 'compliance';
  const contentKind = view.startsWith('content:') ? view.slice(8) : null;

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setRes(await calls.view(app, view, { from: period ? asked.from : null, to: period ? asked.to : null, q: asked.q || null, limit: 500 })); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }, [calls, app, view, period, asked]);
  useEffect(() => { void load(); }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (period && to < from) { setErr('The end date is before the start date.'); return; }
    setAsked({ from, to, q: q.trim() });
  };
  const ask = (p: Pending) => { setMsg(null); setPending(p); };
  const done = (text: string) => async () => { setMsg(text); await load(); };

  const rows = useMemo(() => (res?.rows ?? []).map(flatRow), [res]);
  const cols = useMemo(() => columnsOf(rows, ['id', 'tenant_id', 'user_id', 'body'].filter(k => !(contentKind && k === 'body'))), [rows, contentKind]);

  async function exportXlsx() {
    if (!res) return;
    setMsg(null);
    try {
      // Registered in the Admin EAB access log first (reference number), for every app including Biz.
      const reg = await registerExport();
      const head = cols.map(heading);
      const sheets = [
        { name: 'Summary', rows: [['App', app], ['List', title], ['Reference', reg.reference], ['Exported by', email],
          ['Exported at', new Date().toLocaleString('en-MY')], ...(period ? [['Period', `${res.from} to ${res.to}`]] : []),
          ...(asked.q ? [['Search', asked.q]] : []), ...(res.names_hidden ? [['Note', 'Names are hidden for your role']] : []),
          ...Object.entries(res.summary).map(([k, v]) => [heading(k), cellText(v, k)])] },
        { name: title.slice(0, 31), rows: [head, ...rows.map(row => cols.map(c => { const v = row[c]; return typeof v === 'number' ? v : cellText(v, c); }))] },
      ];
      const blob = new Blob([buildXlsx(sheets, { title: `${title} ${reg.reference}`, author: email }) as BlobPart], { type: XLSX_MIME });
      const how = await saveLocally(blob, `${app.toUpperCase()}-${view.replace(':', '-')}-${reg.reference}.xlsx`);
      setMsg(`Excel ${how}. Reference ${reg.reference}.`);
    } catch (e) { setErr(errText(e)); }
  }
  const registerExport = () => api.startExport(`app_${app}_${view.replace(':', '_')}`, 'xlsx', null,
    { app, view, from: period ? asked.from : null, to: period ? asked.to : null, q: asked.q || null, rows: rows.length });

  const summary = res ? Object.entries(res.summary) : [];
  return (
    <div className="stack">
      <h1>{title}</h1>
      <form className="card boxed row wrap" onSubmit={submit} style={{ gap: 10 }} data-testid="app-filter">
        {period && <>
          <label className="field inline"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="from" /></label>
          <label className="field inline"><span>To</span><input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="to" /></label>
        </>}
        {view !== 'settings' && view !== 'pnl' && view !== 'flags' &&
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search this list" data-testid="app-q" style={{ flex: '1 1 160px' }} />}
        <button className="btn gold" type="submit" disabled={busy}>Show</button>
        {exportOk && res && <button className="btn" type="button" onClick={exportXlsx} data-testid="app-xlsx">Excel</button>}
      </form>

      {msg && <p className="notice ok" role="status" data-testid="app-msg">{msg}</p>}
      {err && <ErrorBox text={err} onRetry={load} />}
      {busy && !res && <Loading />}

      {res && <>
        {summary.length > 0 && (
          <div className="stats" data-testid="app-summary">
            {summary.map(([k, v]) => (
              <div className="stat" key={k}><span className="l">{heading(k)}</span><span className="v">{cellText(v, k) || '0'}</span></div>
            ))}
          </div>
        )}
        {res.names_hidden && <p className="notice warn" data-testid="names-hidden">Totals only: your role does not see names or contact details.</p>}

        {contentKind && manage && (
          <div className="row"><button className="btn gold" onClick={() => setEditing({ id: null, item: { title: '', published: false } })} data-testid="content-add">Add</button></div>
        )}
        {view === 'flags' && manage && (
          <form className="card boxed row wrap" style={{ gap: 8 }} onSubmit={(e: FormEvent) => { e.preventDefault();
            const key = newFlag.key.trim().toLowerCase();
            if (!/^[a-z0-9_.-]{2,60}$/.test(key)) { setErr('Flag key: 2-60 letters, numbers, dot, dash or underscore.'); return; }
            ask({ title: 'Add a feature flag', body: `${key} — starts switched off.`, label: 'Add flag',
              run: reason => calls.setFlag(app, key, newFlag.label.trim() || key, false, reason).then(done('Flag added (off).')) }); }}>
            <input value={newFlag.key} onChange={e => setNewFlag({ ...newFlag, key: e.target.value })} placeholder="key, e.g. new_checkout" aria-label="Flag key" data-testid="flag-key" />
            <input value={newFlag.label} onChange={e => setNewFlag({ ...newFlag, label: e.target.value })} placeholder="What it switches" aria-label="Flag label" />
            <button className="btn" type="submit" data-testid="flag-add">Add flag</button>
          </form>
        )}
        {view === 'admins' && app === 'biz' && can(r, 'appAdmins') && (
          <form className="card boxed row wrap" style={{ gap: 8 }} onSubmit={(e: FormEvent) => { e.preventDefault();
            const em = newAdmin.email.trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setErr('Type the Google email address.'); return; }
            ask({ title: 'Add a Biz admin', body: `${em} as ${newAdmin.role}. They can open the Biz admin after signing in with this Google account.`, label: 'Add',
              run: reason => calls.setBizAdmin(em, newAdmin.role, true, reason).then(done('Admin added.')) }); }}>
            <input value={newAdmin.email} onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })} placeholder="Google email" aria-label="Google email" data-testid="bizadmin-email" />
            <select value={newAdmin.role} onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value })} aria-label="Role">
              {['owner', 'admin', 'compliance', 'viewer'].map(x => <option key={x} value={x}>{heading(x)}</option>)}
            </select>
            <button className="btn" type="submit" data-testid="bizadmin-add">Add admin</button>
          </form>
        )}
        {view === 'adminlog' && app === 'biz' && (
          <div className="row"><button className="btn" data-testid="bizlog-verify" onClick={async () => {
            try { const v = await calls.verifyBizLog(); setMsg(v.ok ? `The Biz log is intact (${v.checked} entries checked).` : `WARNING: entry ${v.first_bad_seq} was changed outside the admin.`); await load(); }
            catch (e) { setErr(errText(e)); } }}>Check log integrity</button></div>
        )}

        {view === 'settings' ? null : rows.length === 0 ? (
          <p className="muted" data-testid="app-empty">{res.names_hidden && Object.keys(res.summary).length ? 'No list for your role.' : 'Nothing to show for this choice.'}</p>
        ) : (
          <div className="tablewrap">
            <table data-testid="app-rows">
              <thead><tr>{cols.map(c => <th key={c}>{heading(c)}</th>)}<RowActionsHead view={view} app={app} role={role} /></tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={String(row.id ?? i)} data-testid="app-row">
                    {cols.map(c => <td key={c}>{cellText(row[c], c)}</td>)}
                    <RowActions row={row} view={view} app={app} role={role} calls={calls} ask={ask} done={done}
                      edit={contentKind ? () => setEditing({ id: String(row.id), item: row as unknown as ContentItem }) : undefined} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(view === 'pnl') && <p className="small muted">Income is accounts 4xxx; expenses are 5xxx and 6xxx; only posted journals in the period. Reversed journals are left out.</p>}
        {app === 'pos' && <p className="small muted">POS records come from phones that sync. A business that has not synced yet does not show. <button className="linkbtn" onClick={() => go({ k: 'search' })}>Find a business owner</button></p>}
      </>}

      {editing && contentKind && (
        <ContentEditor kind={contentKind} initial={editing.item} onCancel={() => setEditing(null)}
          onSave={item => { const id = editing.id; setEditing(null);
            ask({ title: id ? 'Save changes' : 'Add item', body: `${item.title}${item.published ? ' — families will see it.' : ' — not published yet.'}`, label: 'Save',
              run: reason => calls.saveContent(contentKind, id, item, reason).then(done('Saved.')) }); }} />
      )}
      {pending && <ConfirmDialog title={pending.title} body={pending.body} confirmLabel={pending.label} danger={pending.danger}
        onConfirm={async reason => { await pending.run(reason); }} onClose={() => setPending(null)} />}
    </div>
  );
}

function hasActions(view: string, app: OtherApp, role: string): boolean {
  const r = role as Parameters<typeof can>[0];
  if (view === 'tickets') return can(r, 'appTickets');
  if (view === 'requests') return app === 'mm2h' && can(r, 'appRequests');
  if (view === 'flags' || view.startsWith('content:') || (view === 'modules' && app === 'biz')) return can(r, 'appManage');
  if (view === 'admins' && app === 'biz') return can(r, 'appAdmins');
  return false;
}
function RowActionsHead({ view, app, role }: { view: string; app: OtherApp; role: string }) {
  return hasActions(view, app, role) ? <th>Action</th> : null;
}

function RowActions({ row, view, app, role, calls, ask, done, edit }: {
  row: Record<string, unknown>; view: string; app: OtherApp; role: string; calls: AppCalls;
  ask: (p: Pending) => void; done: (t: string) => () => Promise<void>; edit?: () => void;
}) {
  if (!hasActions(view, app, role)) return null;
  const id = String(row.id ?? '');
  let body: JSX.Element | null = null;
  if (view === 'tickets') {
    const st = String(row.status ?? 'open');
    body = <span className="row wrap" style={{ gap: 6 }}>
      {(['in_progress', 'closed', 'open'] as const).filter(s => s !== st).map(s => (
        <button key={s} className="btn small" data-testid={`ticket-${s}`} onClick={() => ask({ title: 'Change ticket status', body: `${row.subject} → ${heading(s)}`, label: 'Change',
          run: reason => calls.setTicket(id, s, reason).then(done('Ticket updated.')) })}>{heading(s)}</button>
      ))}</span>;
  } else if (view === 'requests') {
    body = row.status === 'open' ? <span className="row wrap" style={{ gap: 6 }}>
      <button className="btn small" data-testid="req-done" onClick={() => ask({ title: 'Mark request done', body: `${row.family_name}: ${row.kind}`, label: 'Mark done',
        run: reason => calls.setRequest(id, 'done', reason).then(done('Request marked done.')) })}>Done</button>
      <button className="btn small" onClick={() => ask({ title: 'Refuse request', body: `${row.family_name}: ${row.kind}`, label: 'Refuse', danger: true,
        run: reason => calls.setRequest(id, 'refused', reason).then(done('Request refused.')) })}>Refuse</button></span> : <span className="muted">—</span>;
  } else if (view === 'flags') {
    const on = !!row.enabled;
    body = <button className="btn small" data-testid={`flag-toggle-${row.key}`} onClick={() => ask({ title: on ? 'Switch off' : 'Switch on', body: `${row.label} (${row.key})`, label: on ? 'Switch off' : 'Switch on', danger: on,
      run: reason => calls.setFlag(app, String(row.key), null, !on, reason).then(done(on ? 'Switched off.' : 'Switched on.')) })}>{on ? 'Switch off' : 'Switch on'}</button>;
  } else if (view.startsWith('content:')) {
    const kind = view.slice(8);
    body = <span className="row wrap" style={{ gap: 6 }}>
      <button className="btn small" onClick={edit} data-testid="content-edit">Edit</button>
      <button className="btn small" data-testid="content-delete" onClick={() => ask({ title: 'Delete item', body: String(row.title), label: 'Delete', danger: true,
        run: reason => calls.deleteContent(kind, id, reason).then(done('Deleted.')) })}>Delete</button></span>;
  } else if (view === 'modules') {
    const on = !!row.enabled;
    body = <button className="btn small" data-testid={`module-${row.module}`} onClick={() => ask({ title: on ? 'Switch module off' : 'Switch module on',
      body: `${row.business}: ${row.module}${on ? ' — staff will no longer see it.' : ''}`, label: on ? 'Switch off' : 'Switch on', danger: on,
      run: reason => calls.setModule(String(row.tenant_id), String(row.module), !on, reason).then(done(on ? 'Module switched off.' : 'Module switched on.')) })}>{on ? 'Switch off' : 'Switch on'}</button>;
  } else if (view === 'admins') {
    body = row.active ? <button className="btn small" onClick={() => ask({ title: 'Remove Biz admin', body: String(row.email), label: 'Remove', danger: true,
      run: reason => calls.setBizAdmin(String(row.email), String(row.role), false, reason).then(done('Admin removed.')) })}>Remove</button> : <span className="muted">Off</span>;
  }
  return <td>{body}</td>;
}

const FIELDS: { k: keyof ContentItem; label: string; type?: string; long?: boolean }[] = [
  { k: 'title', label: 'Title' }, { k: 'body', label: 'Text', long: true }, { k: 'url', label: 'Link (https://…)' },
  { k: 'area', label: 'Area / city' }, { k: 'phone', label: 'Phone' }, { k: 'valid_until', label: 'Valid until', type: 'date' },
  { k: 'status', label: 'Status (e.g. planned, live)' }, { k: 'sort', label: 'Order', type: 'number' },
];
function ContentEditor({ kind, initial, onCancel, onSave }: { kind: string; initial: ContentItem; onCancel: () => void; onSave: (i: ContentItem) => void }) {
  const [it, setIt] = useState<ContentItem>({ ...initial });
  const [err, setErr] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!it.title?.trim()) { setErr('A title is needed.'); return; }
    if (it.url && !/^https:\/\//.test(it.url)) { setErr('Links must start with https://'); return; }
    onSave({ ...it, title: it.title.trim(), sort: Number(it.sort) || 0, valid_until: it.valid_until ? String(it.valid_until).slice(0, 10) : null });
  };
  return (
    <div className="overlay" role="presentation">
      <form className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label="Edit item" onSubmit={save} data-testid="content-editor">
        <h2>{initial.title ? 'Edit' : 'Add'} — {heading(kind)}</h2>
        {FIELDS.map(f => (
          <label className="field" key={f.k}><span>{f.label}</span>
            {f.long ? <textarea value={String(it[f.k] ?? '')} maxLength={10000} onChange={e => setIt({ ...it, [f.k]: e.target.value })} />
              : <input type={f.type ?? 'text'} value={String(it[f.k] ?? '')} onChange={e => setIt({ ...it, [f.k]: e.target.value })} data-testid={`ce-${f.k}`} />}
          </label>
        ))}
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!it.published} onChange={e => setIt({ ...it, published: e.target.checked })} data-testid="ce-published" /> Published (families see it)</label>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="row"><button type="button" className="btn" onClick={onCancel}>Cancel</button><span className="spacer" /><button className="btn gold" type="submit" data-testid="ce-save">Continue</button></div>
      </form>
    </div>
  );
}
