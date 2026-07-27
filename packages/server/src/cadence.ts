/**
 * Cadence strings are the human-editable schedule format shown in the Mini App:
 *   daily@09:00,18:00       — every day at those UTC times
 *   weekly:1,4@12:00        — Mondays & Thursdays (0=Sun … 6=Sat)
 *   monthly:1@10:00         — 1st of each month
 *   irregular               — never auto-fires
 * All times are UTC.
 */

export interface Cadence {
  kind: "daily" | "weekly" | "monthly" | "irregular";
  weekdays: number[];
  dayOfMonth: number | null;
  /** "HH:MM" 24h UTC. */
  times: string[];
}

export function parseCadence(s: string): Cadence {
  const trimmed = s.trim().toLowerCase();
  const [head, timesPart] = trimmed.split("@");
  const times = (timesPart ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t));

  const [kindRaw, argRaw] = (head ?? "").split(":");
  const kind = (kindRaw ?? "").trim();

  if (kind === "daily") {
    return { kind: "daily", weekdays: [], dayOfMonth: null, times: times.length ? times : ["09:00"] };
  }
  if (kind === "weekly" || kind === "biweekly") {
    const weekdays = (argRaw ?? "")
      .split(",")
      .map((x) => Number.parseInt(x, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return {
      kind: "weekly",
      weekdays: weekdays.length ? weekdays : [1],
      dayOfMonth: null,
      times: times.length ? times : ["12:00"],
    };
  }
  if (kind === "monthly") {
    const day = Number.parseInt(argRaw ?? "", 10);
    return {
      kind: "monthly",
      weekdays: [],
      dayOfMonth: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1,
      times: times.length ? times : ["10:00"],
    };
  }
  return { kind: "irregular", weekdays: [], dayOfMonth: null, times: [] };
}

/** The next UTC instant strictly after `after` when this cadence fires. */
export function nextFire(c: Cadence, after: Date): Date | null {
  if (c.kind === "irregular" || !c.times.length) return null;

  let best: Date | null = null;
  for (let offset = 0; offset <= 62; offset++) {
    const day = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate() + offset));
    if (c.kind === "weekly" && !c.weekdays.includes(day.getUTCDay())) continue;
    if (c.kind === "monthly" && day.getUTCDate() !== c.dayOfMonth) continue;

    for (const t of c.times) {
      const [hh, mm] = t.split(":").map((x) => Number.parseInt(x, 10));
      const candidate = new Date(day.getTime());
      candidate.setUTCHours(hh ?? 0, mm ?? 0, 0, 0);
      if (candidate > after && (!best || candidate < best)) best = candidate;
    }
    if (best) return best;
  }
  return best;
}

/** Stable identifier for one firing, so restarts never double-generate. */
export function occurrenceKey(slotId: string, fireAt: Date): string {
  return `${slotId}@${fireAt.toISOString()}`;
}
