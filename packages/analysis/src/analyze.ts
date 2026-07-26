import type { ChannelAnalysis, MessageRecord } from "@tgap/shared";
import { detectSlots } from "./cadence.js";
import { detectEras } from "./eras.js";
import { detectGaps } from "./gaps.js";
import { annotate, postsPerDay, styleProfile, topDomains, typeMix } from "./stats.js";
import { DAY_MS, mean } from "./util.js";

export interface AnalyzeOptions {
  channelId: string;
  channelTitle: string;
  now?: Date;
}

/**
 * Top-level entry point: turn a channel's raw message history into a
 * {@link ChannelAnalysis} — cadence slots, eras, gaps, type mix, style and a
 * plain-language narrative. Pure and deterministic; no I/O, no AI. The AI layer
 * consumes this to write the confirmation message and generation prompts.
 */
export function analyzeChannel(messages: MessageRecord[], opts: AnalyzeOptions): ChannelAnalysis {
  const now = opts.now ?? new Date();
  const annotated = annotate(messages);

  const from = annotated[0]?.date ?? now;
  const to = annotated[annotated.length - 1]?.date ?? now;
  const spanDays = Math.max(1, (to.getTime() - from.getTime()) / DAY_MS);

  const perDay = postsPerDay(annotated);
  const mix = typeMix(annotated);
  const slots = detectSlots(annotated, spanDays);
  const eras = detectEras(annotated);
  const gaps = detectGaps(annotated);
  const style = styleProfile(annotated);
  const domains = topDomains(annotated);

  const confidence = overallConfidence(annotated.length, slots);
  const narrative = buildNarrative({
    title: opts.channelTitle,
    total: annotated.length,
    perDay,
    spanDays,
    slots,
    eras,
    gaps,
    style,
  });

  return {
    channelId: opts.channelId,
    channelTitle: opts.channelTitle,
    analyzedAt: now.toISOString(),
    window: { from: from.toISOString(), to: to.toISOString(), totalPosts: annotated.length },
    avgPostsPerDay: Number(perDay.toFixed(2)),
    avgPostsPerWeek: Number((perDay * 7).toFixed(2)),
    typeMix: mix.map((t) => ({ ...t, share: Number(t.share.toFixed(3)) })),
    slots,
    eras,
    gaps,
    styleProfile: style,
    topDomains: domains,
    narrative,
    confidence,
  };
}

function overallConfidence(total: number, slots: ChannelAnalysis["slots"]): number {
  const volume = Math.min(1, total / 200);
  const cadence = slots.length ? mean(slots.map((s) => s.confidence)) : 0.2;
  return Number((0.4 * volume + 0.6 * cadence).toFixed(2));
}

function buildNarrative(x: {
  title: string;
  total: number;
  perDay: number;
  spanDays: number;
  slots: ChannelAnalysis["slots"];
  eras: ChannelAnalysis["eras"];
  gaps: ChannelAnalysis["gaps"];
  style: ChannelAnalysis["styleProfile"];
}): string {
  const months = (x.spanDays / 30).toFixed(0);
  const parts: string[] = [];
  parts.push(
    `Over the last ~${months} months, ${x.title} published ${x.total} posts (~${x.perDay.toFixed(
      1,
    )}/day).`,
  );
  if (x.slots.length) {
    parts.push(`Detected cadence: ${x.slots.slice(0, 4).map((s) => s.label).join("; ")}.`);
  } else {
    parts.push("Posting looks irregular — not enough of a pattern to lock a schedule yet.");
  }
  if (x.gaps.length) {
    const longest = [...x.gaps].sort((a, b) => b.days - a.days)[0]!;
    parts.push(`Note: a ${longest.days}-day dormant stretch was found — posting resumed afterwards.`);
  }
  if (x.eras.length > 1) {
    parts.push(`The channel went through ${x.eras.length} distinct eras (style/cadence shifted over time).`);
  }
  parts.push(`Style: ${x.style.tone}, ~${x.style.avgLengthChars} chars/post.`);
  return parts.join(" ");
}
