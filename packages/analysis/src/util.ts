/** Small date/stat helpers used across the analysis engine (UTC throughout). */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(iso: string): Date {
  return new Date(iso);
}

/** Whole-day UTC key like "2025-03-14". */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Minutes since UTC midnight. */
export function minutesOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function formatHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Group items by a string key. */
export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = map.get(k);
    if (arr) arr.push(it);
    else map.set(k, [it]);
  }
  return map;
}

/**
 * Cluster a set of scalar values (e.g. minutes-of-day) into tight groups.
 * 1-D agglomerative-ish clustering: sort, then split where the gap between
 * neighbours exceeds `gap`. Returns clusters as arrays of the original values.
 */
export function cluster1d(values: number[], gap: number): number[][] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!;
    const last = clusters[clusters.length - 1]!;
    if (v - last[last.length - 1]! <= gap) last.push(v);
    else clusters.push([v]);
  }
  return clusters;
}

/** Extract the registrable-ish domain from a URL string. */
export function domainOf(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
