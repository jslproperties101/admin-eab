// Small shared pieces: loading line, error box, and the "reason + confirm twice" dialog for risky actions (feature 76).
import { ReactNode, useEffect, useRef, useState } from 'react';

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <p className="muted" role="status">{text}</p>;
}
export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="notice error row" role="alert">
      <span className="spacer">{text}</span>
      {onRetry && <button className="btn small" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/**
 * Feature 76: risky actions need a typed reason and a second, separate confirmation. The reason is saved in the
 * Master Audit Log by the database function, so it cannot be skipped by a modified app either.
 */
export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean;
  onConfirm: (reason: string) => Promise<void> | void; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  const ok = reason.trim().length >= 5;
  return (
    <div className="overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dialog card boxed stack" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div>{body}</div>
        {step === 1 ? (
          <>
            <label className="field"><span>Reason (saved in the audit log)</span>
              <textarea ref={first} value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} placeholder="Why is this being done? At least 5 characters." /></label>
            <div className="row">
              <button className="btn" onClick={onClose}>Cancel</button>
              <span className="spacer" />
              <button className="btn gold" disabled={!ok} onClick={() => setStep(2)}>Continue</button>
            </div>
          </>
        ) : (
          <>
            <div className="notice warn">Please confirm. This will be recorded with your name, the time and the reason:<br /><i>“{reason.trim()}”</i></div>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => setStep(1)}>Back</button>
              <span className="spacer" />
              <button className={`btn ${danger ? 'danger' : 'gold'}`} disabled={busy} data-testid="confirm-final"
                onClick={async () => { setBusy(true); setErr(null); try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr((e as Error).message || 'Failed'); setBusy(false); } }}>
                {busy ? 'Saving…' : confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Kv({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return <dl className="kv">{rows.map((r, i) => <div key={i} style={{ display: 'contents' }}><dt>{r.k}</dt><dd>{r.v || <span className="muted">—</span>}</dd></div>)}</dl>;
}
