import { z } from "zod";
import { IsoDate } from "./primitives.js";
import { PostType } from "./messages.js";

/**
 * Lifecycle of a generated draft as it moves through the confirm/edit/decline
 * loop the bot runs with the admin.
 */
export const DraftStatus = z.enum([
  "generating",
  "pending", // awaiting admin confirm/edit/decline
  "approved", // admin confirmed, queued to publish
  "edited", // admin edited then (re)approved
  "declined",
  "published",
  "failed",
]);
export type DraftStatus = z.infer<typeof DraftStatus>;

export const PostDraft = z.object({
  id: z.string(),
  channelId: z.string(),
  slotId: z.string().nullable().default(null),
  postType: PostType,
  text: z.string(),
  imageUrl: z.string().nullable().default(null),
  imagePrompt: z.string().nullable().default(null),
  /** The exact prompt used to write this — surfaced to the admin for transparency. */
  generationPrompt: z.string().default(""),
  /** Source ids that fed this draft. */
  sourceIds: z.array(z.string()).default([]),
  status: DraftStatus,
  scheduledFor: IsoDate.nullable().default(null),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PostDraft = z.infer<typeof PostDraft>;

/** Bot inline-button actions on a draft. */
export const DraftAction = z.enum(["approve", "decline", "edit", "regenerate", "reschedule"]);
export type DraftAction = z.infer<typeof DraftAction>;

/**
 * The generation "recipe" for a slot: an editable, transparent bundle of the
 * schedule, style and prompt that produces posts. Admins can view & edit every
 * field.
 */
export const SlotConfig = z.object({
  slotId: z.string(),
  channelId: z.string(),
  enabled: z.boolean().default(true),
  postType: PostType,
  /** cron-like human schedule the admin can tweak. */
  cadence: z.string(), // e.g. "daily@09:00,18:00"
  /** The editable system/style prompt for this slot. */
  stylePrompt: z.string(),
  /** Whether to attach an AI image. */
  withImage: z.boolean().default(true),
  imageStylePrompt: z.string().default(""),
  sourceIds: z.array(z.string()).default([]),
});
export type SlotConfig = z.infer<typeof SlotConfig>;
