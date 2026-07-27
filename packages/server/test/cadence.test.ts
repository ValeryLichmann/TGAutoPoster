import { describe, expect, it } from "vitest";
import { nextFire, occurrenceKey, parseCadence } from "../src/cadence.js";

describe("parseCadence", () => {
  it("parses daily with multiple times", () => {
    expect(parseCadence("daily@09:00,18:00")).toEqual({
      kind: "daily",
      weekdays: [],
      dayOfMonth: null,
      times: ["09:00", "18:00"],
    });
  });

  it("parses weekly with weekdays", () => {
    const c = parseCadence("weekly:1,4@12:00");
    expect(c.kind).toBe("weekly");
    expect(c.weekdays).toEqual([1, 4]);
    expect(c.times).toEqual(["12:00"]);
  });

  it("defaults weekly with no weekday to Monday", () => {
    expect(parseCadence("weekly:@12:00").weekdays).toEqual([1]);
  });

  it("parses monthly day-of-month", () => {
    const c = parseCadence("monthly:15@10:00");
    expect(c.kind).toBe("monthly");
    expect(c.dayOfMonth).toBe(15);
  });

  it("treats unknown formats as irregular (never fires)", () => {
    expect(parseCadence("whenever").kind).toBe("irregular");
    expect(nextFire(parseCadence("irregular"), new Date())).toBeNull();
  });
});

describe("nextFire", () => {
  // 2025-06-04 is a Wednesday
  const wed = new Date("2025-06-04T10:00:00Z");

  it("finds the next daily time today", () => {
    const c = parseCadence("daily@09:00,18:00");
    expect(nextFire(c, wed)?.toISOString()).toBe("2025-06-04T18:00:00.000Z");
  });

  it("rolls daily to tomorrow after the last time", () => {
    const c = parseCadence("daily@09:00");
    expect(nextFire(c, wed)?.toISOString()).toBe("2025-06-05T09:00:00.000Z");
  });

  it("finds the next weekly occurrence on the right weekday", () => {
    const c = parseCadence("weekly:1@12:00"); // Mondays
    expect(nextFire(c, wed)?.toISOString()).toBe("2025-06-09T12:00:00.000Z");
  });

  it("finds the next monthly occurrence, rolling to next month", () => {
    const c = parseCadence("monthly:1@10:00");
    expect(nextFire(c, wed)?.toISOString()).toBe("2025-07-01T10:00:00.000Z");
  });

  it("is strictly after the reference instant", () => {
    const c = parseCadence("daily@10:00");
    const at = new Date("2025-06-04T10:00:00Z");
    expect(nextFire(c, at)?.toISOString()).toBe("2025-06-05T10:00:00.000Z");
  });
});

describe("occurrenceKey", () => {
  it("is stable for a given slot+instant", () => {
    const d = new Date("2025-06-04T09:00:00Z");
    expect(occurrenceKey("slot_a", d)).toBe(occurrenceKey("slot_a", new Date(d)));
    expect(occurrenceKey("slot_a", d)).not.toBe(occurrenceKey("slot_b", d));
  });
});
