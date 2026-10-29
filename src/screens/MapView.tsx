// AdminBatch010 — a small map drawn by the app itself (no map library): OpenStreetMap tiles under gold bubbles.
// Drag (mouse or finger) to move, the + / − buttons, mouse wheel or double-click to zoom, "Fit" to show every point.
// Nearby points are grouped into one bubble with a number; tapping a bubble calls onPick with its points.
// If the tiles cannot load (offline), the dots still show on a plain dark background.
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

/** The few event fields used here (the project type-checks against a small React stand-in). */
type Ptr = { clientX: number; clientY: number; pointerId: number; target: EventTarget | null; currentTarget: EventTarget | null };
type Wheel = { clientX: number; clientY: number; deltaY: number; preventDefault(): void };
import { Bubble, MAX_ZOOM, MIN_ZOOM, View, bubbleSize, cluster, fitView, project, tilesFor, unproject } from '../admin/content';

/** Standard OpenStreetMap tiles (free, attribution required, light use only — fine for an admin app). */
export const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export function MapView<T extends { lat: number; lng: number }>({ points, label, testid, height = 360, weight, bubbleClass, bubbleTitle, onPick, legend }: {
  points: T[]; label: string; testid?: string; height?: number;
  /** How much one point counts (e.g. agents in a cell). Default 1. */
  weight?: (p: T) => number;
  /** CSS class of a bubble (e.g. by listing status). */
  bubbleClass?: (b: Bubble<T>) => string;
  bubbleTitle?: (b: Bubble<T>) => string;
  onPick?: (items: T[]) => void;
  legend?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  const [view, setView] = useState<View>(() => fitView(points, 360, height));
  const [moved, setMoved] = useState(false);
  const drag = useRef<{ x: number; y: number; c: { x: number; y: number }; id: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // New points (filters changed) → fit them, unless the admin is exploring.
  const sig = useMemo(() => `${points.length}:${points.slice(0, 50).map(p => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(';')}`, [points]);
  useEffect(() => { setView(fitView(points, w, height)); setMoved(false); }, [sig, w, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles = tilesFor(view, w, height);
  const bubbles = cluster(points, view, w, height, 44, weight);
  const zoomBy = (d: number, at?: { x: number; y: number }) => setView(v => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z + d));
    if (z === v.z) return v;
    if (!at) return { ...v, z };
    // keep the place under the pointer where it is
    const c = project(v.lat, v.lng, v.z);
    const p = { x: c.x + at.x - w / 2, y: c.y + at.y - height / 2 };
    const place = unproject(p, v.z);
    const p2 = project(place.lat, place.lng, z);
    const c2 = unproject({ x: p2.x - (at.x - w / 2), y: p2.y - (at.y - height / 2) }, z);
    return { lat: c2.lat, lng: c2.lng, z };
  });
  const down = (e: Ptr) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, c: project(view.lat, view.lng, view.z), id: e.pointerId };
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: Ptr) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const c = unproject({ x: d.c.x - dx, y: d.c.y - dy }, view.z);
    setView(v => ({ ...v, lat: c.lat, lng: c.lng }));
    setMoved(true);
  };
  const up = () => { drag.current = null; };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : undefined;
  };

  return (
    <figure className="map" aria-label={label} data-testid={testid}>
      <div ref={box} className="map-box" style={{ height }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={(e: Wheel) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1, local(e)); setMoved(true); }}
        onDoubleClick={(e: Ptr) => { zoomBy(1, local(e)); setMoved(true); }}>
        {tiles.map(t => (
          <img key={t.key} className="map-tile" alt="" draggable={false} src={TILE_URL(t.z, t.x, t.y)}
            style={{ left: Math.round(t.left), top: Math.round(t.top) }} onError={(e: { target: EventTarget | null }) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        ))}
        {bubbles.map((b, i) => {
          const size = bubbleSize(b.weight);
          const n = Math.round(b.weight);
          return (
            <button key={i} className={`bubble ${bubbleClass ? bubbleClass(b) : ''}`} data-testid="map-bubble"
              title={bubbleTitle ? bubbleTitle(b) : `${n}`} aria-label={bubbleTitle ? bubbleTitle(b) : `${n} here`}
              style={{ left: Math.round(b.x - size / 2), top: Math.round(b.y - size / 2), width: size, height: size }}
              onClick={() => onPick?.(b.items)}>
              {n > 1 ? n : ''}
            </button>
          );
        })}
        <div className="map-ctl">
          <button className="btn small" aria-label="Zoom in" onClick={() => { zoomBy(1); setMoved(true); }}>+</button>
          <button className="btn small" aria-label="Zoom out" onClick={() => { zoomBy(-1); setMoved(true); }}>−</button>
          {moved && <button className="btn small" onClick={() => { setView(fitView(points, w, height)); setMoved(false); }} data-testid="map-fit">Fit</button>}
        </div>
        <small className="map-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</small>
      </div>
      <figcaption className="small muted">{label}{points.length === 0 ? ' · nothing to show' : ''}{legend ? <> · {legend}</> : null}</figcaption>
    </figure>
  );
}
