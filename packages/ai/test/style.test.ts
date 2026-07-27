import { describe, expect, it } from "vitest";
import type { MessageRecord } from "@tgap/shared";
import { selectExamples, formatCorrections } from "../src/style.js";
import { buildPostGenerationPrompt } from "../src/prompts.js";

function msg(o: { text: string; views?: number; urls?: string[] }): MessageRecord {
  return {
    id: Math.floor(Math.random() * 1e6),
    channelId: "-1",
    date: new Date().toISOString(),
    text: o.text,
    media: "none",
    groupedId: null,
    views: o.views ?? 0,
    forwards: 0,
    reactions: 0,
    urls: o.urls ?? [],
    hashtags: [],
    hasPoll: false,
    isForward: false,
    forwardFrom: null,
  };
}

describe("selectExamples", () => {
  it("picks posts of the right type ranked by engagement", () => {
    const newsA = msg({
      text: "The regulator approved the merger after months of review and debate today.",
      urls: ["https://reuters.com/x"],
      views: 100,
    });
    const newsB = msg({
      text: "Parliament passed the budget bill in a late-night session on Thursday.",
      urls: ["https://reuters.com/y"],
      views: 9000,
    });
    const quote = msg({ text: "Stay hungry, stay foolish." });
    const examples = selectExamples([newsA, quote, newsB], "news", 2);
    expect(examples).toHaveLength(2);
    expect(examples[0]).toContain("budget bill"); // higher engagement first
    expect(examples.join()).not.toContain("hungry");
  });
});

describe("grounded prompt", () => {
  it("embeds items, style guide, examples and corrections", () => {
    const req = buildPostGenerationPrompt({
      styleGuide: "# Style\nBe terse.",
      examples: ["Example post one"],
      corrections: [{ before: "meh draft", after: "sharp version" }],
      sources: [],
      topic: "chip news",
      postType: "news",
      items: [
        {
          title: "New chip launched",
          url: "https://example.com/chip",
          excerpt: "The chip does things.",
          sourceTitle: "example.com",
          sourcePrompt: "focus on specs",
        },
      ],
    });
    expect(req.system).toContain("Be terse.");
    expect(req.system).toContain("Example post one");
    expect(req.system).toContain("sharp version");
    expect(req.prompt).toContain("### ITEM: New chip launched");
    expect(req.prompt).toContain("LINK: https://example.com/chip");
    expect(req.prompt).toContain("admin note: focus on specs");
    expect(req.tier).toBe("fast"); // news → cheap model
    expect(req.cacheSystem).toBe(true);
  });

  it("uses the smart tier for long-form types", () => {
    const req = buildPostGenerationPrompt({
      styleGuide: "g",
      sources: [],
      topic: "t",
      postType: "analysis",
    });
    expect(req.tier).toBe("smart");
  });
});

describe("formatCorrections", () => {
  it("is empty with no edits and includes the last pairs otherwise", () => {
    expect(formatCorrections([])).toBe("");
    const out = formatCorrections([{ before: "a", after: "b" }]);
    expect(out).toContain("Owner corrections");
    expect(out).toContain("b");
  });
});
