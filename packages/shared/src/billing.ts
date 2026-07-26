import { z } from "zod";
import { IsoDate } from "./primitives.js";

export const Plan = z.enum(["trial", "free", "pro"]);
export type Plan = z.infer<typeof Plan>;

/**
 * A user's entitlement. Freemium model: `trial` for the first N days (full
 * access), then `free` (rate-limited) unless upgraded to `pro`.
 */
export const Entitlement = z.object({
  userId: z.string(),
  plan: Plan,
  trialStartedAt: IsoDate,
  trialEndsAt: IsoDate,
  proUntil: IsoDate.nullable().default(null),
  /** Posts approved today (for free-tier daily quota). */
  usedToday: z.number().int().nonnegative().default(0),
  quotaResetAt: IsoDate,
});
export type Entitlement = z.infer<typeof Entitlement>;

/** Result of an entitlement check the bot/API runs before doing paid work. */
export const AccessDecision = z.object({
  allowed: z.boolean(),
  plan: Plan,
  reason: z.string(),
  /** Remaining actions today on the current plan (null = unlimited). */
  remainingToday: z.number().int().nullable(),
  upgradeSuggested: z.boolean(),
});
export type AccessDecision = z.infer<typeof AccessDecision>;
