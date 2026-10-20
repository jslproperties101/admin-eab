// Feature 79: Admin EAB signs out after 15 minutes without use, on every device.
// "Use" = a tap, click, key press, scroll or touch. Time spent with the app in the background counts as idle: the
// last-used time is kept on the device, so coming back after 15 minutes signs out even if the timer never fired.
export const IDLE_MS = 15 * 60_000;
const KEY = 'admin-eab-last-used';

export interface Clock { now: () => number }
export const realClock: Clock = { now: () => Date.now() };

export function markUsed(clock: Clock = realClock): void {
  try { localStorage.setItem(KEY, String(clock.now())); } catch { /* storage blocked: the in-memory timer still works */ }
}
export function lastUsed(): number | null {
  try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
/** True when the last use is more than 15 minutes ago (or unknown, after a sign-in has already happened). */
export function isIdle(last: number | null, now: number, limit = IDLE_MS): boolean {
  return last !== null && now - last >= limit;
}

/** Starts watching. Calls onIdle once when the limit is reached. Returns a function that stops watching. */
export function watchIdle(onIdle: () => void, clock: Clock = realClock, limit = IDLE_MS): () => void {
  markUsed(clock);
  let fired = false;
  let lastWrite = 0;
  let memLast = clock.now(); // used when the device refuses storage
  const bump = () => {
    const t = clock.now();
    memLast = t;
    if (t - lastWrite > 5_000) { lastWrite = t; markUsed(clock); } // write at most every 5 seconds
  };
  const check = () => {
    if (fired) return;
    const last = Math.max(lastUsed() ?? 0, memLast);
    if (isIdle(last, clock.now(), limit)) { fired = true; onIdle(); }
  };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  for (const e of events) window.addEventListener(e, bump, { passive: true, capture: true });
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(check, 15_000);
  return () => {
    for (const e of events) window.removeEventListener(e, bump, { capture: true } as EventListenerOptions);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}
