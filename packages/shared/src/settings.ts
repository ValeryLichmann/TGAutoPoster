import { z } from "zod";

/**
 * Autopilot posture for a channel — how far generation goes without a human.
 * - manual: drafts wait for explicit confirm (default)
 * - semi:   drafts auto-publish after a grace window unless declined
 * - auto:   drafts publish immediately — the "fully replaces the admin" mode
 */
export const AutopilotMode = z.enum(["manual", "semi", "auto"]);
export type AutopilotMode = z.infer<typeof AutopilotMode>;

export const ChannelSettings = z.object({
  autopilot: AutopilotMode.default("manual"),
});
export type ChannelSettings = z.infer<typeof ChannelSettings>;

/** Aggregated AI spend, shown in the admin panel. */
export const AiUsageTotals = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  /** Rough estimate based on configured per-MTok prices. */
  estCostUsd: z.number().nonnegative(),
});
export type AiUsageTotals = z.infer<typeof AiUsageTotals>;
