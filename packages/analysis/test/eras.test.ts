import { describe, expect, it } from "vitest";
import { analyzeChannel } from "../src/analyze.js";
import { candidateSources } from "../src/sources.js";
import { annotate } from "../src/stats.js";
import { at, msg, newsMsg } from "./fixtures.js";
import type { MessageRecord } from "@tgap/shared";

const BASE = new Date("2024-01-01T00:00:00Z");

/** Active for 60 days, dormant for ~4 months, then a new denser style. */
function wavyHistory(): MessageRecord[] {
  const out: MessageRecord[] = [];
  for (let day = 0; day < 60; day++) out.push(newsMsg(at(BASE, day, 10)));
  // ~120-day gap, then resume with 3x/day media-forward posts
  for (let day = 180; day < 240; day++) {
    out.push(msg({ date: at(BASE, day, 8), text: "pic", media: "photo" }));
    out.push(msg({ date: at(BASE, day, 14), text: "pic", media: "photo" }));
    out.push(msg({ date: at(BASE, day, 20), text: "pic", media: "photo" }));
  }
  return out;
}

describe("eras & gaps", () => {
  const history = wavyHistory();
  const analysis = analyzeChannel(history, {
    channelId: "-1001",
    channelTitle: "Wavy",
    now: at(BASE, 241, 0),
  });

  it("detects the long dormant gap", () => {
    expect(analysis.gaps.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...analysis.gaps.map((g) => g.days))).toBeGreaterThan(100);
  });

  it("splits history into at least two eras with different dominant types", () => {
    expect(analysis.eras.length).toBeGreaterThanOrEqual(2);
    const first = analysis.eras[0]!.dominantTypes[0]?.type;
    const last = analysis.eras[analysis.eras.length - 1]!.dominantTypes[0]?.type;
    expect(first).not.toBe(last);
  });
});

describe("candidate sources", () => {
  it("surfaces the most-cited domains as unapproved guesses", () => {
    const history: MessageRecord[] = [];
    for (let i = 0; i < 10; i++) history.push(newsMsg(at(BASE, i, 9), "reuters.com"));
    for (let i = 0; i < 4; i++) history.push(newsMsg(at(BASE, i, 15), "bloomberg.com"));
    const sources = candidateSources("-1001", annotate(history));
    expect(sources.map((s) => s.title)).toContain("reuters.com");
    expect(sources.every((s) => !s.approved && s.origin === "ai_guessed")).toBe(true);
    expect(sources[0]!.rationale).toMatch(/Cited in/);
  });
});
