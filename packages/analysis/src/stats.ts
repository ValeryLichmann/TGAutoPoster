import type { MessageRecord, PostType, TypeShare } from "@tgap/shared";
import { classifyMessage } from "./classify.js";
import { DAY_MS, dayKey, domainOf, groupBy, mean, toDate } from "./util.js";

/** A message decorated with its derived post type + parsed date. */
export interface AnnotatedMessage {
  record: MessageRecord;
  date: Date;
  type: PostType;
}

export function annotate(messages: MessageRecord[]): AnnotatedMessage[] {
  return messages
    .map((record) => ({ record, date: toDate(record.date), type: classifyMessage(record) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function typeMix(annotated: AnnotatedMessage[]): TypeShare[] {
  const total = annotated.length || 1;
  const counts = new Map<PostType, number>();
  for (const a of annotated) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

export function postsPerDay(annotated: AnnotatedMessage[]): number {
  if (annotated.length < 2) return annotated.length;
  const span =
    (annotated[annotated.length - 1]!.date.getTime() - annotated[0]!.date.getTime()) / DAY_MS;
  return span > 0 ? annotated.length / span : annotated.length;
}

/** Distinct active days -> average posts on days that actually had posts. */
export function postsPerActiveDay(annotated: AnnotatedMessage[]): number {
  const byDay = groupBy(annotated, (a) => dayKey(a.date));
  const counts = [...byDay.values()].map((v) => v.length);
  return mean(counts);
}

export interface StyleProfile {
  avgLengthChars: number;
  emojiDensity: number;
  usesHashtags: boolean;
  linksOutShare: number;
  tone: string;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function styleProfile(annotated: AnnotatedMessage[]): StyleProfile {
  if (!annotated.length) {
    return { avgLengthChars: 0, emojiDensity: 0, usesHashtags: false, linksOutShare: 0, tone: "unknown" };
  }
  const lengths = annotated.map((a) => a.record.text.length);
  const emojiCounts = annotated.map((a) => (a.record.text.match(EMOJI_RE) ?? []).length);
  const withHashtags = annotated.filter((a) => a.record.hashtags.length > 0).length;
  const withLinks = annotated.filter((a) => a.record.urls.length > 0).length;
  const avgLen = mean(lengths);
  const emojiDensity = mean(emojiCounts);

  let tone = "neutral";
  if (emojiDensity > 2 && avgLen < 400) tone = "punchy, casual";
  else if (avgLen > 800) tone = "long-form, editorial";
  else if (withLinks / annotated.length > 0.6) tone = "news-wire, link-heavy";

  return {
    avgLengthChars: Math.round(avgLen),
    emojiDensity: Number(emojiDensity.toFixed(2)),
    usesHashtags: withHashtags / annotated.length > 0.2,
    linksOutShare: Number((withLinks / annotated.length).toFixed(2)),
    tone,
  };
}

export function topDomains(
  annotated: AnnotatedMessage[],
  limit = 10,
): { domain: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of annotated) {
    for (const url of a.record.urls) {
      const d = domainOf(url);
      if (!d) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    if (a.record.isForward && a.record.forwardFrom) {
      const key = `t.me/${a.record.forwardFrom}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
