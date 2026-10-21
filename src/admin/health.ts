// AdminBatch004 — plain functions behind the System Health screens (no browser needed, so they are unit-tested).
//   * sizes in words (12.4 MB), percentages, durations
//   * the storage forecast: growth per day from daily readings (least-squares line), and the date the limit is reached
//   * the traffic-light level shown on each box

export const MB = 1024 * 1024;

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const neg = n < 0; let v = Math.abs(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const s = i === 0 ? String(Math.round(v)) : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${neg ? '-' : ''}${s} ${units[i]}`;
}

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.max(0, (part / whole) * 100) : 0);
export const fmtPct = (p: number | null | undefined, digits = 1): string =>
  p === null || p === undefined || !Number.isFinite(p) ? '—' : `${p.toFixed(digits)}%`;

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

/** green under 70%, amber 70–90%, red 90%+ */
export type Level = 'ok' | 'amber' | 'red';
export const levelFor = (usedPct: number): Level => (usedPct >= 90 ? 'red' : usedPct >= 70 ? 'amber' : 'ok');

export interface Point { day: string; bytes: number }

const DAY_MS = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const addDays = (d: string, n: number) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);

/**
 * Growth in bytes per day: least-squares slope through the readings of the last `windowDays` days.
 * Needs at least two readings on different days; otherwise null ("not enough readings yet").
 */
export function growthPerDay(points: Point[], windowDays = 90): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  const last = dayNum(sorted[sorted.length - 1].day);
  const use = sorted.filter(p => last - dayNum(p.day) <= windowDays);
  if (use.length < 2 || dayNum(use[0].day) === last) return null;
  const xs = use.map(p => dayNum(p.day)), ys = use.map(p => p.bytes);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : num / den;
}

/** Running total of stored files by day, built from uploads per day and today's total (so it works from day one). */
export function cumulativeFromUploads(uploads: { day: string; bytes: number }[], totalNow: number, today: string): Point[] {
  const sorted = [...uploads].sort((a, b) => a.day.localeCompare(b.day));
  const inWindow = sorted.reduce((n, u) => n + u.bytes, 0);
  let run = Math.max(0, totalNow - inWindow);     // what was stored before the window
  const out: Point[] = [];
  for (const u of sorted) { run += u.bytes; out.push({ day: u.day, bytes: run }); }
  if (!out.length || out[out.length - 1].day !== today) out.push({ day: today, bytes: totalNow });
  return out;
}

export interface Forecast {
  used: number; limit: number; usedPct: number; level: Level;
  perDay: number | null;          // bytes per day; null = not enough readings
  daysLeft: number | null;        // null = not growing, or not enough readings
  fullOn: string | null;          // date the limit is reached at this rate
  sentence: string;
}

export function forecast(used: number, limit: number, points: Point[], today: string): Forecast {
  const usedPct = pct(used, limit);
  const perDay = growthPerDay(points);
  let daysLeft: number | null = null, fullOn: string | null = null, sentence: string;
  if (used >= limit) { daysLeft = 0; fullOn = today; sentence = 'Full now — the limit has been reached.'; }
  else if (perDay === null) sentence = 'Not enough daily readings yet. A forecast appears after readings on two different days.';
  else if (perDay <= 0) sentence = 'Not growing at the moment, so no end date.';
  else {
    daysLeft = Math.floor((limit - used) / perDay);
    fullOn = addDays(today, daysLeft);
    sentence = daysLeft > 3650
      ? `Growing about ${fmtBytes(perDay)} a day — more than 10 years left at this rate.`
      : `Growing about ${fmtBytes(perDay)} a day — full in about ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${fullOn}) at this rate.`;
  }
  return { used, limit, usedPct, level: levelFor(usedPct), perDay, daysLeft, fullOn, sentence };
}

/** A backup restore test older than this many days is shown as overdue (monthly checks, plus a week's grace). */
export const RESTORE_TEST_DUE_DAYS = 37;
export function daysSince(day: string | null | undefined, today: string): number | null {
  return day ? dayNum(today) - dayNum(day) : null;
}

/** Today's date in Malaysia (the database uses the same). */
export const todayKL = (now = new Date()) => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/** Share of sync runs that failed, as a percentage, or null if there were none. */
export const failRate = (runs: number, fails: number) => (runs > 0 ? (fails / runs) * 100 : null);
