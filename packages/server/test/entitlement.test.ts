import { describe, expect, it } from "vitest";
import { checkAccess, createTrial, grantPro, recordUsage, resolvePlan } from "../src/entitlement.js";

const policy = { trialDays: 3, freeDailyLimit: 1 };
const T0 = new Date("2025-01-01T08:00:00Z");
const dayLater = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

describe("freemium entitlement", () => {
  it("starts as a full-access trial", () => {
    const e = createTrial("u1", policy, T0);
    expect(resolvePlan(e, T0)).toBe("trial");
    const a = checkAccess(e, policy, T0);
    expect(a.allowed).toBe(true);
    expect(a.remainingToday).toBeNull(); // unlimited during trial
  });

  it("drops to the rate-limited free tier after the trial", () => {
    const e = createTrial("u1", policy, T0);
    const after = dayLater(T0, 4);
    expect(resolvePlan(e, after)).toBe("free");
    const a = checkAccess(e, policy, after);
    expect(a.allowed).toBe(true);
    expect(a.remainingToday).toBe(1);
  });

  it("enforces the free daily quota and resets the next day", () => {
    let e = createTrial("u1", policy, T0);
    const d4 = dayLater(T0, 4);
    e = recordUsage(e, d4); // uses the 1 free post
    const blocked = checkAccess(e, policy, d4);
    expect(blocked.allowed).toBe(false);
    expect(blocked.upgradeSuggested).toBe(true);

    const d5 = dayLater(T0, 5);
    const reset = checkAccess(e, policy, d5);
    expect(reset.allowed).toBe(true);
    expect(reset.remainingToday).toBe(1);
  });

  it("grants unlimited access on Pro", () => {
    let e = createTrial("u1", policy, T0);
    e = grantPro(e, 1, dayLater(T0, 4));
    const a = checkAccess(e, policy, dayLater(T0, 10));
    expect(a.plan).toBe("pro");
    expect(a.allowed).toBe(true);
    expect(a.remainingToday).toBeNull();
  });
});
