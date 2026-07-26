import { describe, expect, it } from "vitest";
import { analyzeChannel } from "../src/analyze.js";
import { at, msg, newsMsg } from "./fixtures.js";
import type { MessageRecord } from "@tgap/shared";

const BASE = new Date("2024-01-01T00:00:00Z");

/**
 * Build a year of history with a *known* schedule:
 *   - 2× daily news at 09:00 and 18:00
 *   - 1× weekly digest on Mondays at 12:00
 *   - 1× monthly announcement on the 1st at 10:00
 */
function syntheticYear(): MessageRecord[] {
  const out: MessageRecord[] = [];
  for (let day = 0; day < 365; day++) {
    out.push(newsMsg(at(BASE, day, 9, 3))); // ~09:00 with small jitter
    out.push(newsMsg(at(BASE, day, 18, 1))); // ~18:00
    const d = at(BASE, day, 12);
    if (d.getUTCDay() === 1) {
      out.push(
        msg({
          date: at(BASE, day, 12),
          text: "Weekly digest:\n1. story a\n2. story b\n3. story c\n4. story d",
        }),
      );
    }
    if (d.getUTCDate() === 1) {
      out.push(
        msg({ date: at(BASE, day, 10), text: "Announcement: we are launching a new format this month." }),
      );
    }
  }
  return out;
}

describe("cadence detection on a known schedule", () => {
  const analysis = analyzeChannel(syntheticYear(), {
    channelId: "-1001",
    channelTitle: "Test Channel",
    now: at(BASE, 366, 0),
  });

  it("recovers roughly the right daily volume", () => {
    // 2 news/day + weekly + monthly ≈ 2.17/day
    expect(analysis.avgPostsPerDay).toBeGreaterThan(2);
    expect(analysis.avgPostsPerDay).toBeLessThan(2.6);
  });

  it("finds a 2× daily news slot at morning and evening", () => {
    const daily = analysis.slots.find((s) => s.postType === "news" && s.periodicity === "daily");
    expect(daily).toBeDefined();
    expect(daily!.timesOfDay.length).toBe(2);
    expect(daily!.timesOfDay[0]!.startsWith("09")).toBe(true);
    expect(daily!.timesOfDay[1]!.startsWith("18")).toBe(true);
    expect(daily!.countPerPeriod).toBe(2);
  });

  it("finds a weekly digest on Mondays", () => {
    const weekly = analysis.slots.find((s) => s.postType === "digest");
    expect(weekly).toBeDefined();
    expect(weekly!.periodicity).toBe("weekly");
    expect(weekly!.weekdays).toContain(1); // Monday
  });

  it("finds a monthly announcement", () => {
    const monthly = analysis.slots.find((s) => s.postType === "announcement");
    expect(monthly).toBeDefined();
    expect(monthly!.periodicity).toBe("monthly");
    expect(monthly!.dayOfMonth).toBe(1);
  });

  it("produces a non-empty narrative and reasonable confidence", () => {
    expect(analysis.narrative.length).toBeGreaterThan(20);
    expect(analysis.confidence).toBeGreaterThan(0.5);
  });
});
