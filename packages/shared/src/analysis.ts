import { z } from "zod";
import { Confidence, IsoDate, Weekday } from "./primitives.js";
import { PostType } from "./messages.js";

/** How often a recurring slot fires. */
export const Periodicity = z.enum(["daily", "weekly", "biweekly", "monthly", "irregular"]);
export type Periodicity = z.infer<typeof Periodicity>;

/**
 * One detected recurring posting "slot" — e.g. "2× daily news at ~09:00 and
 * ~18:00" or "1× weekly digest on Mondays".
 */
export const ScheduleSlot = z.object({
  id: z.string(),
  periodicity: Periodicity,
  /** For weekly/biweekly: which weekdays. Empty for daily/monthly. */
  weekdays: z.array(Weekday).default([]),
  /** For monthly: day-of-month (1–31), else null. */
  dayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
  /** Typical time(s) of day in "HH:MM" 24h UTC. */
  timesOfDay: z.array(z.string()).default([]),
  /** How many posts per period fall into this slot. */
  countPerPeriod: z.number().positive(),
  postType: PostType,
  confidence: Confidence,
  /** Human-readable summary, e.g. "2× daily news, mornings & evenings". */
  label: z.string(),
});
export type ScheduleSlot = z.infer<typeof ScheduleSlot>;

/**
 * A distinct "era" of the channel — the engine splits history when it detects a
 * structural break (a long gap, or a shift in cadence/style/type mix).
 */
export const ChannelEra = z.object({
  start: IsoDate,
  end: IsoDate,
  postCount: z.number().int().nonnegative(),
  avgPerDay: z.number().nonnegative(),
  dominantTypes: z.array(z.object({ type: PostType, share: z.number() })),
  /** Short natural-language description of what changed / the style. */
  summary: z.string(),
});
export type ChannelEra = z.infer<typeof ChannelEra>;

/** A dormant stretch with no posts. */
export const InactivityGap = z.object({
  start: IsoDate,
  end: IsoDate,
  days: z.number().int().positive(),
});
export type InactivityGap = z.infer<typeof InactivityGap>;

export const TypeShare = z.object({
  type: PostType,
  count: z.number().int().nonnegative(),
  share: z.number(),
});
export type TypeShare = z.infer<typeof TypeShare>;

/**
 * The full result of analysing a channel's history. This is the object the bot
 * confirms with the user and the Mini App renders.
 */
export const ChannelAnalysis = z.object({
  channelId: z.string(),
  channelTitle: z.string(),
  analyzedAt: IsoDate,
  window: z.object({ from: IsoDate, to: IsoDate, totalPosts: z.number().int() }),

  avgPostsPerDay: z.number().nonnegative(),
  avgPostsPerWeek: z.number().nonnegative(),
  typeMix: z.array(TypeShare),

  slots: z.array(ScheduleSlot),
  eras: z.array(ChannelEra),
  gaps: z.array(InactivityGap),

  /** Detected posting style descriptors (tone, length, emoji use, etc). */
  styleProfile: z.object({
    avgLengthChars: z.number(),
    emojiDensity: z.number(),
    usesHashtags: z.boolean(),
    linksOutShare: z.number(),
    tone: z.string(),
  }),

  /** Domains the channel links to most (candidate sources). */
  topDomains: z.array(z.object({ domain: z.string(), count: z.number().int() })),

  /** One-paragraph plain-language summary for the user. */
  narrative: z.string(),
  confidence: Confidence,
});
export type ChannelAnalysis = z.infer<typeof ChannelAnalysis>;
