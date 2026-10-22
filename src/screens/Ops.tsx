// AdminBatch006 Part B — Operations: Maintenance Mode (68), App Release Manager (66), Feature Flags (67).
// Maintenance and the minimum version are read by the main app at launch and on every sync (MainForAdmin-D,
// eab_public_settings). Feature flags: the main app can read them with eab_my_flags(); until a main-app batch does,
// switching a flag changes nothing on phones (said on the screen). Every change needs a typed reason + second confirm.
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { OpsTab, errText, useAdmin } from '../ctx';
import { can } from '../admin/roles';
import { AudienceGroup, EVERYONE, FeatureFlag, OpsSettings } from '../api/admin';
import { FLAG_KEY_RE, VERSION_RE, describeFilters, flagKey, fromLocalInput, sortGroups, toLocalInput } from '../admin/news';
import { fmtTime } from '../export/reports';
import { ConfirmDialog, ErrorBox, Loading } from './ui';

const TABS: { k: OpsTab; label: string }[] = [{ k: 'maintenance', label: 'Maintenance mode' }, { k: 'release', label: 'App release' }, { k: 'flags', label: 'Feature flags' }];

export function OpsScreen({ tab: first }: { tab: OpsTab }) {
  const { me } = useAdmin();
  const [tab, setTab] = useState<OpsTab>(first);
  return (
    <div className="stack">
      <h1>Operations</h1>
      {!can(me.role, 'editOps') && <p className="notice small" data-testid="read-only">Your role can look but not change anything here.</p>}
      <div className="tabs" role="group" aria-label="Operations">
        {TABS.map(t => <button key={t.k} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} data-testid={`otab-${t.k}`}>{t.label}</button>)}
      </div>
      {tab === 'maintenance' && <MaintenanceTab />}
      {tab === 'release' && <ReleaseTab />}
      {tab === 'flags' && <FlagsTab />}
    </div>
  );
}

function useSettings() {
  const { api } = useAdmin();
  const [s, setS] = useState<OpsSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setErr(null); try { setS(await api.opsSettings()); } catch (e) { setErr(errText(e)); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  return { s, setS, err, load };
}

type Confirm = null | { title: string; body: ReactNode; label: string; danger?: boolean; run: (reason: string) => Promise<void> };

// ---------------------------------------------------------------- Maintenance mode (68)
function MaintenanceTab() {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editOps');
  const { s, setS, err, load } = useSettings();
  const [form, setForm] = useState<{ en: string; bm: string; zh: string; back: string } | null>(null);
  const [c, setC] = useState<Confirm>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (s && !form) setForm({ en: s.maintenance_message_en ?? '', bm: s.maintenance_message_bm ?? '', zh: s.maintenance_message_zh ?? '', back: toLocalInput(s.maintenance_back_at) }); }, [s, form]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s || !form) return <Loading />;
  const on = s.maintenance_on;
  const patch = (turnOn: boolean) => ({ maintenance_on: turnOn, maintenance_message_en: form.en.trim(), maintenance_message_bm: form.bm.trim(), maintenance_message_zh: form.zh.trim(), maintenance_back_at: fromLocalInput(form.back) });
  const ask = (turnOn: boolean | null) => setC({
    title: turnOn === true ? 'Switch maintenance mode ON' : turnOn === false ? 'Switch maintenance mode OFF' : 'Save the maintenance message',
    body: turnOn === true ? <p><b>Every agent is blocked from using the app</b> (also the sign-in screen) and sees your message, until you switch it off.
        Phones that miss “off” unlock by themselves 12 hours after they last heard it.</p>
      : turnOn === false ? <p>Agents can use the app again at their next launch or sync.</p> : <p>The message is saved; maintenance stays {on ? 'ON' : 'off'}.</p>,
    label: turnOn === true ? 'Switch ON' : turnOn === false ? 'Switch OFF' : 'Save', danger: turnOn === true,
    run: async reason => {
      const r = await api.setOps(turnOn === null ? { ...patch(on) } : patch(turnOn), reason);
      setS({ ...s, ...r }); setMsg(turnOn === true ? 'Maintenance mode is ON.' : turnOn === false ? 'Maintenance mode is off.' : 'Message saved.');
    },
  });
  const okToTurnOn = form.en.trim().length > 0;
  return (
    <div className="stack" data-testid="maintenance">
      <div className={`card boxed row ${on ? 'alert-red' : ''}`} data-testid="maint-state">
        <b className="spacer">{on ? 'Maintenance mode is ON — agents cannot use the app' : 'Maintenance mode is off'}</b>
        {s.maintenance_back_at && on && <small>Back at {fmtTime(s.maintenance_back_at)}</small>}
        {edit && (on ? <button className="btn gold" onClick={() => ask(false)} data-testid="maint-off">Switch off</button>
          : <button className="btn danger" disabled={!okToTurnOn} onClick={() => ask(true)} data-testid="maint-on">Switch on</button>)}
      </div>
      {msg && <p className="notice ok small" role="status" data-testid="ops-msg">{msg}</p>}
      <label className="field"><span>Message in English (needed)</span><textarea rows={3} maxLength={1000} disabled={!edit} value={form.en} onChange={e => setForm({ ...form, en: e.target.value })} data-testid="maint-en" /></label>
      <label className="field"><span>Bahasa Melayu (empty → English)</span><textarea rows={3} maxLength={1000} disabled={!edit} value={form.bm} onChange={e => setForm({ ...form, bm: e.target.value })} data-testid="maint-bm" /></label>
      <label className="field"><span>中文 Chinese (empty → English)</span><textarea rows={3} maxLength={1000} disabled={!edit} value={form.zh} onChange={e => setForm({ ...form, zh: e.target.value })} data-testid="maint-zh" /></label>
      <label className="field"><span>Expected back (Malaysia time, optional)</span><input type="datetime-local" disabled={!edit} value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} data-testid="maint-back" /></label>
      {edit && <div className="row"><span className="spacer" /><button className="btn" onClick={() => ask(null)} data-testid="maint-save">Save message only</button></div>}
      <small className="muted">Last changed {fmtTime(s.updated_at)}. Every change is in the Master Audit Log.</small>
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- App Release Manager (66)
function ReleaseTab() {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editOps');
  const { s, setS, err, load } = useSettings();
  const [v, setV] = useState<string | null>(null);
  const [mode, setMode] = useState<'soft' | 'hard'>('soft');
  const [url, setUrl] = useState('');
  const [c, setC] = useState<Confirm>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (s && v === null) { setV(s.min_version ?? ''); setMode(s.min_version_mode ?? 'soft'); setUrl(s.update_url ?? ''); } }, [s, v]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!s || v === null) return <Loading />;
  const vBad = v.trim() !== '' && !VERSION_RE.test(v.trim());
  const urlBad = url.trim() !== '' && !/^https:\/\/\S+$/.test(url.trim());
  const ok = !vBad && !urlBad;
  const save = () => setC({
    title: v.trim() ? `Minimum version ${v.trim()} — ${mode === 'hard' ? 'hard block' : 'soft warning'}` : 'Remove the minimum version',
    body: v.trim() ? (mode === 'hard'
      ? <p><b>Agents on an older version cannot use the app</b> until they update (the “Update now” button opens {url.trim() || 'the store'}).</p>
      : <p>Agents on an older version see a notice they can close; they can keep using the app.</p>) : <p>No agent is asked to update.</p>,
    label: 'Save', danger: mode === 'hard' && !!v.trim(),
    run: async reason => { const r = await api.setOps({ min_version: v.trim() || null, min_version_mode: mode, update_url: url.trim() || null }, reason); setS({ ...s, ...r }); setMsg('Saved.'); },
  });
  return (
    <div className="stack" data-testid="release">
      <div className="card boxed" data-testid="release-state">
        {s.min_version ? <><b>Minimum version {s.min_version}</b> · {s.min_version_mode === 'hard' ? <span className="tag red">Hard block</span> : <span className="tag amber">Soft warning</span>}</> : <b>No minimum version set</b>}
        {s.update_url && <><br /><small className="muted">Update link: {s.update_url}</small></>}
      </div>
      {msg && <p className="notice ok small" role="status" data-testid="ops-msg">{msg}</p>}
      <label className="field"><span>Minimum app version (e.g. 2.2.0; empty = none)</span><input value={v} disabled={!edit} onChange={e => setV(e.target.value)} data-testid="rel-version" /></label>
      {vBad && <p className="error small">A version looks like 2.2.0</p>}
      <fieldset className="field"><span>Older versions get</span>
        <div className="row">
          <label className="choice"><input type="radio" disabled={!edit} checked={mode === 'soft'} onChange={() => setMode('soft')} data-testid="rel-soft" /> Soft warning (can continue)</label>
          <label className="choice"><input type="radio" disabled={!edit} checked={mode === 'hard'} onChange={() => setMode('hard')} data-testid="rel-hard" /> Hard block (must update)</label>
        </div>
      </fieldset>
      <label className="field"><span>Update link (https://…, e.g. the Play Store or GitHub release page)</span><input value={url} disabled={!edit} onChange={e => setUrl(e.target.value)} data-testid="rel-url" /></label>
      {urlBad && <p className="error small">The link must start with https://</p>}
      {edit && <div className="row"><span className="spacer" /><button className="btn gold" disabled={!ok} onClick={save} data-testid="rel-save">Save</button></div>}
      <small className="muted">The versions agents use now are in Dashboards → Versions & phones.</small>
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Feature Flags (67)
function FlagsTab() {
  const { api, me } = useAdmin();
  const edit = can(me.role, 'editOps');
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeatureFlag | 'new' | null>(null);
  const [c, setC] = useState<Confirm>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { const [f, g] = await Promise.all([api.flags(), api.groups().catch(() => [] as AudienceGroup[])]); setFlags(f); setGroups(g); } catch (e) { setErr(errText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox text={err} onRetry={() => void load()} />;
  if (!flags) return <Loading />;
  const gname = (id: string) => groups.find(g => g.id === id)?.name ?? '?';
  const flip = (f: FeatureFlag) => setC({
    title: `${f.enabled ? 'Switch off' : 'Switch on'}: ${f.label}`, body: <p>{f.enabled ? 'The feature is switched off' : 'The feature is switched on'} for {f.audience === 'all' ? 'every agent' : f.group_ids.map(gname).join(', ')}.</p>,
    label: f.enabled ? 'Switch off' : 'Switch on', danger: f.enabled,
    run: async reason => { await api.flagSave({ key: f.key, enabled: !f.enabled }, reason); await load(); },
  });
  return (
    <div className="stack" data-testid="flags">
      <div className="row"><h2 className="spacer">Feature flags</h2>{edit && <button className="btn small gold" onClick={() => setEditing('new')} data-testid="flag-new">New flag</button>}</div>
      <p className="notice warn small" data-testid="flags-note">The main app does not read these switches yet. Until a main-app update does, switching a flag changes nothing on phones.</p>
      {editing && <FlagEditor flag={editing === 'new' ? null : editing} groups={groups} taken={flags.map(f => f.key)} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
      {flags.length === 0 ? <p className="muted">No flags yet.</p> : (
        <div className="tablewrap dash-table">
          <table data-testid="flag-list">
            <thead><tr><th>Feature</th><th>Key</th><th>For</th><th>State</th><th /></tr></thead>
            <tbody>{flags.map(f => (
              <tr key={f.key}>
                <td><b>{f.label}</b>{f.description && <><br /><small className="muted">{f.description}</small></>}</td>
                <td className="mono small">{f.key}</td>
                <td className="small">{f.audience === 'all' ? 'Every agent' : f.group_ids.map(gname).join(', ')}</td>
                <td>{f.enabled ? <span className="tag ok">On</span> : <span className="tag">Off</span>}<br /><small className="muted">{fmtTime(f.updated_at)}</small></td>
                <td className="row">{edit && <>
                  <button className={`btn small ${f.enabled ? '' : 'gold'}`} onClick={() => flip(f)} data-testid="flag-flip">{f.enabled ? 'Switch off' : 'Switch on'}</button>
                  <button className="btn small" onClick={() => setEditing(f)} data-testid="flag-edit">Edit</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}

function FlagEditor({ flag, groups, taken, onClose, onSaved }: { flag: FeatureFlag | null; groups: AudienceGroup[]; taken: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { api } = useAdmin();
  const [label, setLabel] = useState(flag?.label ?? '');
  const [key, setKey] = useState(flag?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(!!flag);
  const [desc, setDesc] = useState(flag?.description ?? '');
  const [audience, setAudience] = useState<'all' | 'groups'>(flag?.audience ?? 'all');
  const [gids, setGids] = useState<string[]>(flag?.group_ids ?? []);
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [c, setC] = useState<Confirm>(null);
  const k = keyTouched ? key : flagKey(label);
  const keyBad = !FLAG_KEY_RE.test(k) || (!flag && taken.includes(k));
  const ok = label.trim() && !keyBad && (audience === 'all' || gids.length > 0);
  return (
    <div className="card boxed stack" data-testid="flag-editor">
      <div className="row"><h3 className="spacer">{flag ? 'Edit flag' : 'New flag'}</h3><button className="btn small" onClick={onClose}>Cancel</button></div>
      <label className="field"><span>Feature name</span><input value={label} maxLength={120} onChange={e => setLabel(e.target.value)} data-testid="flag-label" /></label>
      <label className="field"><span>Key the main app uses (small letters, digits, _ . -){flag ? ' — cannot be changed' : ''}</span>
        <input className="mono" value={k} disabled={!!flag} onChange={e => { setKeyTouched(true); setKey(e.target.value.toLowerCase()); }} data-testid="flag-key" /></label>
      {keyBad && <p className="error small">{taken.includes(k) && !flag ? 'This key is already used.' : 'The key must be 2–60 small letters, digits, dot, dash or underscore.'}</p>}
      <label className="field"><span>What it does (optional)</span><textarea rows={2} maxLength={1000} value={desc} onChange={e => setDesc(e.target.value)} /></label>
      <fieldset className="field"><span>For</span>
        <div className="row">
          <label className="choice"><input type="radio" checked={audience === 'all'} onChange={() => setAudience('all')} data-testid="flag-all" /> Every agent</label>
          <label className="choice"><input type="radio" checked={audience === 'groups'} onChange={() => setAudience('groups')} data-testid="flag-groups" /> Chosen audience groups</label>
        </div>
      </fieldset>
      {audience === 'groups' && <div className="checks">{sortGroups(groups).filter(g => g.id !== EVERYONE).map(g => (
        <label key={g.id} className="choice"><input type="checkbox" checked={gids.includes(g.id)} onChange={e => setGids(e.target.checked ? [...gids, g.id] : gids.filter(x => x !== g.id))} data-testid="flag-group" />
          {' '}{g.name} <small className="muted">({g.agents ?? 0} agents · {describeFilters(g.filters)})</small></label>))}
        {!groups.some(g => g.id !== EVERYONE) && <p className="muted small">No groups yet: make one in News & Announcements → Audience groups.</p>}</div>}
      {!flag && <label className="choice switch"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} data-testid="flag-enabled" /> Switch on now</label>}
      <div className="row"><span className="spacer" /><button className="btn gold" disabled={!ok} data-testid="flag-save" onClick={() => setC({
        title: flag ? `Save flag “${label.trim()}”` : `Make flag “${label.trim()}”`, body: <p>Key <span className="mono">{k}</span> · {audience === 'all' ? 'every agent' : `${gids.length} group(s)`}{!flag ? ` · ${enabled ? 'ON' : 'off'}` : ''}.</p>,
        label: 'Save', run: async reason => {
          await api.flagSave({ key: k, label: label.trim(), description: desc.trim() || null, audience, group_ids: audience === 'groups' ? gids : [], ...(flag ? {} : { enabled }) }, reason);
          await onSaved();
        } })}>Save</button></div>
      {c && <ConfirmDialog title={c.title} body={c.body} confirmLabel={c.label} danger={c.danger} onConfirm={c.run} onClose={() => setC(null)} />}
    </div>
  );
}
