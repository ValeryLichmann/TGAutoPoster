import { z } from "zod";
import { Confidence, IsoDate } from "./primitives.js";

export const SourceKind = z.enum(["rss", "website", "telegram", "twitter", "reddit", "other"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceOrigin = z.enum([
  "ai_guessed", // discovered by the AI from history/domains
  "ai_investigated", // AI fetched & verified it's a real feed
  "user_added", // admin added it manually
]);
export type SourceOrigin = z.infer<typeof SourceOrigin>;

/**
 * A content source feeding a channel. Sources are transparent to the admin:
 * AI-guessed ones can be reviewed, edited, approved or deleted, and admins can
 * add their own with a custom prompt/comment.
 */
export const Source = z.object({
  id: z.string(),
  channelId: z.string(),
  kind: SourceKind,
  title: z.string(),
  url: z.string(),
  origin: SourceOrigin,
  /** Admin-approved sources are eligible to feed generation. */
  approved: z.boolean().default(false),
  /** Free-text admin instruction applied when using this source. */
  prompt: z.string().default(""),
  /** Why the AI thinks this is a source (shown to the admin for transparency). */
  rationale: z.string().default(""),
  confidence: Confidence.default(0.5),
  createdAt: IsoDate,
});
export type Source = z.infer<typeof Source>;

/** Payload to create/update a source from the Mini App. */
export const SourceInput = Source.pick({
  kind: true,
  title: true,
  url: true,
  prompt: true,
}).partial({ title: true });
export type SourceInput = z.infer<typeof SourceInput>;
