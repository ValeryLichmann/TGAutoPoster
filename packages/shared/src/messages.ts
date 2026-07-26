import { z } from "zod";
import { IsoDate, TelegramId } from "./primitives.js";

/**
 * Post "type" taxonomy. The analysis engine classifies each historical message
 * into one of these buckets; the same taxonomy drives generation.
 */
export const PostType = z.enum([
  "news", // outward-linking, time-sensitive, often with a source
  "digest", // a roundup / multiple items in one post
  "analysis", // long-form opinion / breakdown
  "announcement", // channel/product news, events
  "promo", // ads, affiliate, paid placements
  "media", // image/video-forward, little text
  "poll", // Telegram poll
  "quote", // short quote / aphorism
  "question", // engagement / AMA prompt
  "other",
]);
export type PostType = z.infer<typeof PostType>;

export const MediaKind = z.enum(["none", "photo", "video", "album", "document", "animation"]);
export type MediaKind = z.infer<typeof MediaKind>;

/**
 * A single ingested historical message, normalized from MTProto/Bot API.
 * This is the raw input to the analysis engine.
 */
export const MessageRecord = z.object({
  id: z.number().int(),
  channelId: TelegramId,
  /** UTC timestamp the message was posted. */
  date: IsoDate,
  text: z.string().default(""),
  media: MediaKind.default("none"),
  /** Grouped-album id, if the message is part of an album. */
  groupedId: z.string().nullable().default(null),
  views: z.number().int().nonnegative().nullable().default(null),
  forwards: z.number().int().nonnegative().nullable().default(null),
  reactions: z.number().int().nonnegative().nullable().default(null),
  /** Outbound URLs found in the message (domains feed source discovery). */
  urls: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  hasPoll: z.boolean().default(false),
  /** True when the message is forwarded from elsewhere. */
  isForward: z.boolean().default(false),
  forwardFrom: z.string().nullable().default(null),
});
export type MessageRecord = z.infer<typeof MessageRecord>;
