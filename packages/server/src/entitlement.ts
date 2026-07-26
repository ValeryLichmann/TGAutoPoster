import type { AccessDecision, Entitlement, Plan } from "@tgap/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EntitlementPolicy {
  trialDays: number;
  freeDailyLimit: number;
}

/** Fresh entitlement for a new user: full-access trial for `trialDays`. */
export function createTrial(userId: string, policy: EntitlementPolicy, now = new Date()): Entitlement {
  return {
    userId,
    plan: "trial",
    trialStartedAt: now.toISOString(),
    trialEndsAt: new Date(now.getTime() + policy.trialDays * DAY_MS).toISOString(),
    proUntil: null,
    usedToday: 0,
    quotaResetAt: nextMidnight(now).toISOString(),
  };
}

/** Effective plan right now, considering trial expiry and pro subscription. */
export function resolvePlan(e: Entitlement, now = new Date()): Plan {
  if (e.proUntil && new Date(e.proUntil) > now) return "pro";
  if (new Date(e.trialEndsAt) > now) return "trial";
  return "free";
}

/**
 * Decide whether the user may perform a metered action (generate/approve a
 * post). Pro and trial are unlimited; free tier is capped per day. Rolls the
 * daily quota over when past `quotaResetAt`.
 */
export function checkAccess(
  e: Entitlement,
  policy: EntitlementPolicy,
  now = new Date(),
): AccessDecision {
  const plan = resolvePlan(e, now);
  const used = past(e.quotaResetAt, now) ? 0 : e.usedToday;

  if (plan === "pro") {
    return { allowed: true, plan, reason: "Pro — unlimited", remainingToday: null, upgradeSuggested: false };
  }
  if (plan === "trial") {
    const daysLeft = Math.max(0, Math.ceil((new Date(e.trialEndsAt).getTime() - now.getTime()) / DAY_MS));
    return {
      allowed: true,
      plan,
      reason: `Free trial — ${daysLeft} day(s) left`,
      remainingToday: null,
      upgradeSuggested: daysLeft <= 1,
    };
  }
  // free
  const remaining = Math.max(0, policy.freeDailyLimit - used);
  return {
    allowed: remaining > 0,
    plan,
    reason:
      remaining > 0
        ? `Free tier — ${remaining} post(s) left today`
        : "Free tier daily limit reached — upgrade to Pro for unlimited posts",
    remainingToday: remaining,
    upgradeSuggested: true,
  };
}

/** Record one metered action, resetting the daily counter if the day rolled. */
export function recordUsage(e: Entitlement, now = new Date()): Entitlement {
  const rolled = past(e.quotaResetAt, now);
  return {
    ...e,
    plan: resolvePlan(e, now),
    usedToday: (rolled ? 0 : e.usedToday) + 1,
    quotaResetAt: rolled ? nextMidnight(now).toISOString() : e.quotaResetAt,
  };
}

/** Activate/extend Pro by `months` (Telegram Stars payment success handler). */
export function grantPro(e: Entitlement, months: number, now = new Date()): Entitlement {
  const base = e.proUntil && new Date(e.proUntil) > now ? new Date(e.proUntil) : now;
  const until = new Date(base.getTime() + months * 30 * DAY_MS);
  return { ...e, plan: "pro", proUntil: until.toISOString() };
}

function past(iso: string, now: Date): boolean {
  return now.getTime() >= new Date(iso).getTime();
}

function nextMidnight(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}
