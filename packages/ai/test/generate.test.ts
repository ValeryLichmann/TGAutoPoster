import { describe, expect, it } from "vitest";
import type { ChannelAnalysis, SlotConfig, Source } from "@tgap/shared";
import { createAiClient } from "../src/index.js";
import { generatePostDraft } from "../src/generate.js";
import { investigateSources } from "../src/investigate.js";

const ai = createAiClient({ AI_MODE: "mock" });

const slot: SlotConfig = {
  slotId: "slot_news_0",
  channelId: "-1001",
  enabled: true,
  postType: "news",
  cadence: "daily@09:00,18:00",
  stylePrompt: "Write concise news posts for a tech channel.",
  withImage: true,
  imageStylePrompt: "techy blue gradient",
  sourceIds: ["s1"],
};

const sources: Source[] = [
  {
    id: "s1",
    channelId: "-1001",
    kind: "website",
    title: "reuters.com",
    url: "https://reuters.com",
    origin: "ai_guessed",
    approved: true,
    prompt: "prioritise market stories",
    rationale: "cited often",
    confidence: 0.9,
    createdAt: new Date().toISOString(),
  },
];

describe("generatePostDraft (mock)", () => {
  it("produces a pending draft with text, an image and a transparent prompt", async () => {
    const draft = await generatePostDraft(ai, {
      channelId: "-1001",
      slot,
      sources,
      topic: "central bank rate decision",
    });
    expect(draft.status).toBe("pending");
    expect(draft.text.length).toBeGreaterThan(10);
    expect(draft.imageUrl).toMatch(/^data:image\/svg/);
    expect(draft.generationPrompt).toContain("SYSTEM:");
    expect(draft.sourceIds).toEqual(["s1"]);
  });
});

describe("investigateSources (mock)", () => {
  it("returns enriched, unapproved sources from cited domains", async () => {
    const analysis = {
      channelId: "-1001",
      channelTitle: "Test",
      topDomains: [
        { domain: "reuters.com", count: 10 },
        { domain: "bloomberg.com", count: 6 },
      ],
      styleProfile: { tone: "news-wire" },
    } as unknown as ChannelAnalysis;

    const found = await investigateSources(ai, analysis);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((s) => !s.approved && s.origin === "ai_investigated")).toBe(true);
  });
});
