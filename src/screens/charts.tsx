// AdminBatch005 — small charts drawn in the app itself (SVG, no chart library), gold on black.
// Every chart has a text title for screen readers and a hover / long-press tooltip per bar or point.
import { ReactNode } from 'react';
import { DOW_LABEL, heatGrid } from '../admin/dash';
import { DashUsage } from '../api/admin';

const EMPTY = <p className="muted small">Nothing recorded in this period.</p>;

/** Vertical bars, one per label. */
export function Bars({ items, label, testid }: { items: { label: string; value: number }[]; label: string; testid?: string }) {
  if (!items.length) return EMPTY;
  const max = Math.max(1, ...items.map(i => i.value));
  const w = 600, h = 150, gap = items.length > 60 ? 1 : 3, bw = Math.max(2, (w - gap * items.length) / items.length);
  return (
    <figure className="chart" aria-label={label} data-testid={testid}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" preserveAspectRatio="none">
        {items.map((it, i) => {
          const vh = (it.value / max) * (h - 4);
          return <g key={i}><title>{`${it.label}: ${it.value.toLocaleString()}`}</title><rect x={i * (bw + gap)} y={h - vh} width={bw} height={vh} className="b" /></g>;
        })}
      </svg>
      <div className="row small muted"><span>{items[0].label}</span><span className="spacer" /><span>{items[items.length - 1].label}</span></div>
      <figcaption className="small muted">{label} · highest {max.toLocaleString()}</figcaption>
    </figure>
  );
}

/** One or more lines over the same labels (e.g. daily, weekly and monthly active). */
export function Lines({ labels, series, label, testid }: {
  labels: string[]; series: { name: string; values: number[]; cls: 'l1' | 'l2' | 'l3' }[]; label: string; testid?: string;
}) {
  if (!labels.length) return EMPTY;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const w = 600, h = 160, pad = 4;
  const x = (i: number) => (labels.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (labels.length - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  return (
    <figure className="chart lines" aria-label={label} data-testid={testid}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={w} y1={y(max * f)} y2={y(max * f)} className="grid" />)}
        {series.map(s => (
          <g key={s.name}>
            <polyline className={s.cls} fill="none" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} vectorEffect="non-scaling-stroke" />
            {labels.length <= 62 && s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} className={s.cls}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="row small muted"><span>{labels[0]}</span><span className="spacer" /><span>{labels[labels.length - 1]}</span></div>
      <figcaption className="small legend">
        {series.map(s => <span key={s.name}><i className={`sw ${s.cls}`} />{s.name}</span>)}
        <span className="muted">highest {max.toLocaleString()}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars with the label and number on each line; optional click per line. */
export function HBars({ items, label, testid, onPick, unit, share = true }: {
  items: { key: string; label: ReactNode; value: number; sub?: ReactNode }[]; label: string; testid?: string;
  onPick?: (key: string) => void; unit?: string; /** false for rates, where "share of the total" means nothing */ share?: boolean;
}) {
  if (!items.length) return EMPTY;
  const max = Math.max(1, ...items.map(i => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="hbars" role="list" aria-label={label} data-testid={testid}>
      {items.map(it => {
        const body = (
          <>
            <span className="hl">{it.label}{it.sub && <small className="muted"> {it.sub}</small>}</span>
            <span className="hb"><span style={{ width: `${(it.value / max) * 100}%` }} /></span>
            <span className="hv">{it.value.toLocaleString()}{unit ? ` ${unit}` : ''} <small className="muted">{share && total ? `${Math.round((it.value / total) * 100)}%` : ''}</small></span>
          </>
        );
        return onPick
          ? <button key={it.key} role="listitem" className="hrow pick" onClick={() => onPick(it.key)}>{body}</button>
          : <div key={it.key} role="listitem" className="hrow">{body}</div>;
      })}
    </div>
  );
}

/** Day x hour (Malaysia time) — darker gold = more use. */
export function Heatmap({ rows, testid, caption }: { rows: DashUsage['heatmap']; testid?: string; caption?: (max: number) => string }) {
  const { grid, max } = heatGrid(rows);
  if (!max) return EMPTY;
  return (
    <div className="tablewrap heat" data-testid={testid}>
      <table aria-label="Use by day of week and hour (Malaysia time)">
        <thead><tr><th />{Array.from({ length: 24 }, (_, hr) => <th key={hr} className="small">{hr % 3 === 0 ? hr : ''}</th>)}</tr></thead>
        <tbody>{grid.map((row, d) => (
          <tr key={d}><th className="small">{DOW_LABEL[d]}</th>
            {row.map((v, hr) => <td key={hr} title={`${DOW_LABEL[d]} ${String(hr).padStart(2, '0')}:00 — ${v}`}
              style={{ background: v ? `rgba(212, 175, 55, ${0.15 + 0.85 * (v / max)})` : undefined }} />)}
          </tr>
        ))}</tbody>
      </table>
      <small className="muted">{caption ? caption(max) : `Screens and features opened, by day and hour (Malaysia time). Darker = more. Busiest hour: ${max} actions.`}</small>
    </div>
  );
}
