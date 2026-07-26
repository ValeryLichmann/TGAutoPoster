import type { Periodicity, PostType, ScheduleSlot, Weekday } from "@tgap/shared";
import { WEEKDAY_NAMES } from "@tgap/shared";
import type { AnnotatedMessage } from "./stats.js";
import { cluster1d, DAY_MS, formatHHMM, groupBy, median, minutesOfDay, stdev } from "./util.js";

/** Map a median inter-post interval (days) to a periodicity bucket. */
function periodicityFromInterval(medianDays: number): Periodicity {
  if (medianDays <= 2) return "daily";
  if (medianDays <= 10) return "weekly";
  if (medianDays <= 20) return "biweekly";
  if (medianDays <= 45) return "monthly";
  return "irregular";
}

/** Median times-of-day of tight clusters that hold a meaningful share of posts. */
function significantTimes(dates: Date[]): string[] {
  const mins = dates.map(minutesOfDay);
  const clusters = cluster1d(mins, 75); // 75-minute tolerance
  const threshold = Math.max(2, dates.length * 0.15);
  return clusters
    .filter((c) => c.length >= threshold)
    .map((c) => median(c))
    .sort((a, b) => a - b)
    .map(formatHHMM);
}

/** Weekday bins that hold a meaningful share of posts. */
function significantWeekdays(dates: Date[]): Weekday[] {
  const bins = new Array(7).fill(0) as number[];
  for (const d of dates) bins[d.getUTCDay()]! += 1;
  const threshold = Math.max(2, dates.length * 0.15);
  return bins
    .map((count, wd) => ({ count, wd: wd as Weekday }))
    .filter((b) => b.count >= threshold)
    .map((b) => b.wd);
}

function dominantDayOfMonth(dates: Date[]): number | null {
  const bins = new Map<number, number>();
  for (const d of dates) bins.set(d.getUTCDate(), (bins.get(d.getUTCDate()) ?? 0) + 1);
  let best: { day: number; count: number } | null = null;
  for (const [day, count] of bins) if (!best || count > best.count) best = { day, count };
  return best && best.count >= Math.max(2, dates.length * 0.4) ? best.day : null;
}

/** Regularity → confidence: tight, high-volume cadences score higher. */
function regularityConfidence(intervalsDays: number[]): number {
  if (intervalsDays.length < 2) return 0.3;
  const m = median(intervalsDays);
  if (m <= 0) return 0.4;
  const cv = stdev(intervalsDays) / m; // coefficient of variation
  const regularity = Math.max(0, 1 - cv); // 0 (chaotic) … 1 (metronomic)
  const volume = Math.min(1, intervalsDays.length / 20);
  return Number((0.35 + 0.5 * regularity + 0.15 * volume).toFixed(2));
}

function buildLabel(
  periodicity: Periodicity,
  count: number,
  type: PostType,
  weekdays: Weekday[],
  times: string[],
): string {
  const times_ = times.length ? ` at ${times.join(" & ")}` : "";
  switch (periodicity) {
    case "daily":
      return `${count}× daily ${type}${times_}`;
    case "weekly": {
      const days = weekdays.map((w) => WEEKDAY_NAMES[w]).join("/");
      return `${count}× weekly ${type}${days ? ` on ${days}` : ""}${times_}`;
    }
    case "biweekly":
      return `${type} every 2 weeks${times_}`;
    case "monthly":
      return `${count}× monthly ${type}${times_}`;
    default:
      return `irregular ${type}`;
  }
}

/**
 * Detect recurring posting slots per {@link PostType}. For each type with enough
 * volume we derive its periodicity from the median inter-post interval, then the
 * typical times-of-day, weekdays and per-period count. Low-volume or chaotic
 * types are reported as a single "irregular" slot.
 */
export function detectSlots(annotated: AnnotatedMessage[], spanDays: number): ScheduleSlot[] {
  const byType = groupBy(annotated, (a) => a.type);
  const slots: ScheduleSlot[] = [];
  let idx = 0;

  for (const [type, group] of byType) {
    if (group.length < 3) continue; // not enough to call it recurring
    const dates = group.map((g) => g.date).sort((a, b) => a.getTime() - b.getTime());

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i]!.getTime() - dates[i - 1]!.getTime()) / DAY_MS);
    }
    const medInterval = median(intervals);
    const periodicity = periodicityFromInterval(medInterval);
    const times = significantTimes(dates);
    const weekdays = periodicity === "weekly" || periodicity === "biweekly" ? significantWeekdays(dates) : [];
    const dayOfMonth = periodicity === "monthly" ? dominantDayOfMonth(dates) : null;

    let countPerPeriod: number;
    if (periodicity === "daily") {
      // posts per active day, approximated by the number of daily time slots
      countPerPeriod = Math.max(1, times.length || Math.round(group.length / Math.max(1, spanDays)));
    } else if (periodicity === "weekly") {
      countPerPeriod = Math.max(1, weekdays.length || Math.round(group.length / (spanDays / 7)));
    } else if (periodicity === "biweekly") {
      countPerPeriod = 1;
    } else if (periodicity === "monthly") {
      countPerPeriod = Math.max(1, Math.round(group.length / Math.max(1, spanDays / 30)));
    } else {
      countPerPeriod = 1;
    }

    slots.push({
      id: `slot_${type}_${idx++}`,
      periodicity,
      weekdays,
      dayOfMonth,
      timesOfDay: times,
      countPerPeriod,
      postType: type as PostType,
      confidence: regularityConfidence(intervals),
      label: buildLabel(periodicity, countPerPeriod, type as PostType, weekdays, times),
    });
  }

  // Most confident / highest-cadence first.
  return slots.sort((a, b) => b.confidence - a.confidence);
}
