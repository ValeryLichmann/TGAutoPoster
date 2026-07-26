import type { ChannelEra, PostType } from "@tgap/shared";
import type { AnnotatedMessage } from "./stats.js";
import { postsPerDay, typeMix } from "./stats.js";
import { DAY_MS } from "./util.js";

/**
 * Split the timeline into "eras" at structural breaks. A break is a long dormant
 * gap (default ≥ 30 days). Adjacent segments are then merged back if their
 * dominant post type and cadence are similar, so we only surface eras that
 * represent a genuine change in how the channel operates ("came back in a new
 * style").
 */
export function detectEras(annotated: AnnotatedMessage[], breakDays = 30): ChannelEra[] {
  if (!annotated.length) return [];

  // 1. Cut at long gaps.
  const segments: AnnotatedMessage[][] = [[annotated[0]!]];
  for (let i = 1; i < annotated.length; i++) {
    const gap = (annotated[i]!.date.getTime() - annotated[i - 1]!.date.getTime()) / DAY_MS;
    if (gap >= breakDays) segments.push([annotated[i]!]);
    else segments[segments.length - 1]!.push(annotated[i]!);
  }

  const eras = segments.filter((s) => s.length >= 3).map(segmentToEra);

  // 2. Merge neighbours with the same dominant type + similar cadence.
  const merged: ChannelEra[] = [];
  for (const era of eras) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.dominantTypes[0]?.type === era.dominantTypes[0]?.type &&
      Math.abs(prev.avgPerDay - era.avgPerDay) < 0.5
    ) {
      // Keep the earlier era's summary but extend its window/count.
      prev.end = era.end;
      prev.postCount += era.postCount;
    } else {
      merged.push(era);
    }
  }
  return merged;
}

function segmentToEra(seg: AnnotatedMessage[]): ChannelEra {
  const mix = typeMix(seg);
  const dominant = mix.slice(0, 3).map((t) => ({ type: t.type as PostType, share: Number(t.share.toFixed(2)) }));
  const perDay = postsPerDay(seg);
  const top = dominant[0]?.type ?? "other";
  return {
    start: seg[0]!.date.toISOString(),
    end: seg[seg.length - 1]!.date.toISOString(),
    postCount: seg.length,
    avgPerDay: Number(perDay.toFixed(2)),
    dominantTypes: dominant,
    summary: `${seg.length} posts, ~${perDay.toFixed(1)}/day, mostly ${top}.`,
  };
}
