import type { InactivityGap } from "@tgap/shared";
import type { AnnotatedMessage } from "./stats.js";
import { DAY_MS } from "./util.js";

/**
 * Detect dormant stretches. A gap is any run between two consecutive posts that
 * is at least `minDays` long. These both feed the "waves / inactivity" narrative
 * and act as candidate era boundaries.
 */
export function detectGaps(annotated: AnnotatedMessage[], minDays = 14): InactivityGap[] {
  const gaps: InactivityGap[] = [];
  for (let i = 1; i < annotated.length; i++) {
    const prev = annotated[i - 1]!.date;
    const cur = annotated[i]!.date;
    const days = (cur.getTime() - prev.getTime()) / DAY_MS;
    if (days >= minDays) {
      gaps.push({
        start: prev.toISOString(),
        end: cur.toISOString(),
        days: Math.round(days),
      });
    }
  }
  return gaps;
}
