// Document Vault (feature 19): every pack and export kept in one place for 7 years, with its fingerprint.
// Files can be downloaded (their fingerprint is checked first) but never changed or deleted.
// "Check a file": pick any PDF / Excel file (e.g. a copy a regulator sent back) to prove whether it is exactly a file
// Admin EAB made, and which one.
import { useCallback, useEffect, useState } from 'react';
import { useAdmin, errText } from '../ctx';
import { Pack } from '../api/admin';
import { sha256Hex } from '../api/session';
import { fmtTime } from '../export/reports';
import { shortFp } from '../export/pack';
import { KIND_LABEL, PackList } from './Case';
import { ErrorBox, Kv, Loading } from './ui';

export function VaultScreen() {
  const { api } = useAdmin();
  const [rows, setRows] = useState<Pack[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api.vault()); } catch (e) { setErr(errText(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="stack">
      <h1>Document Vault</h1>
      <p className="muted" style={{ margin: 0 }}>Every case pack and agent export, kept for 7 years. Nobody can change or delete a file here. Downloads are recorded.</p>
      <CheckFile />
      {err && <ErrorBox text={err} onRetry={() => void load()} />}
      {!rows && !err && <Loading />}
      {rows && <PackList packs={rows} showCase />}
    </div>
  );
}

function CheckFile() {
  const { api } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ name: string; sha: string; pack: Pack | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const sha = await sha256Hex(f);
      setRes({ name: f.name, sha, pack: await api.checkFile(sha) });
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card boxed stack" data-testid="check-file">
      <h3>Check a file</h3>
      <small className="muted">Choose a PDF or Excel file. Its fingerprint is worked out on this device (the file is not uploaded) and looked up in the vault.</small>
      <input type="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => void onFile(e.target.files?.[0])} disabled={busy} data-testid="check-file-input" />
      {busy && <small role="status">Checking…</small>}
      {err && <p className="error">{err}</p>}
      {res && (res.pack ? (
        <div className="notice ok" data-testid="check-file-ok">
          <b>Genuine and unchanged.</b> “{res.name}” is exactly the file made by Admin EAB:
          <Kv rows={[
            { k: 'Reference', v: res.pack.reference },
            { k: 'What', v: KIND_LABEL[res.pack.kind] },
            { k: 'Case', v: res.pack.case_no ?? '' },
            { k: 'Agent', v: res.pack.agent_email ?? '' },
            { k: 'Made', v: `${fmtTime(res.pack.created_at)}${res.pack.created_by_email ? ` by ${res.pack.created_by_email}` : ''}` },
            { k: 'Fingerprint', v: <span className="mono">{res.sha}</span> },
          ]} />
        </div>
      ) : (
        <div className="notice error" data-testid="check-file-bad">
          <b>Not found.</b> “{res.name}” (fingerprint {shortFp(res.sha)}) is not a file Admin EAB made — or it was changed after it was made, even by one character.
        </div>
      ))}
    </div>
  );
}
