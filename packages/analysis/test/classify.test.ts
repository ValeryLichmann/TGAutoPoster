import { describe, expect, it } from "vitest";
import { classifyMessage } from "../src/classify.js";
import { msg } from "./fixtures.js";

const D = new Date("2025-01-01T09:00:00Z");

describe("classifyMessage", () => {
  it("detects polls", () => {
    expect(classifyMessage(msg({ date: D, hasPoll: true }))).toBe("poll");
  });

  it("detects promos", () => {
    expect(classifyMessage(msg({ date: D, text: "Use promo code SAVE20 for a discount!" }))).toBe(
      "promo",
    );
  });

  it("detects media-forward posts", () => {
    expect(classifyMessage(msg({ date: D, text: "nice", media: "photo" }))).toBe("media");
  });

  it("detects digests from list structure", () => {
    const text = "Weekly roundup:\n1. thing one\n2. thing two\n3. thing three";
    expect(classifyMessage(msg({ date: D, text }))).toBe("digest");
  });

  it("detects news with an outbound link", () => {
    const m = msg({
      date: D,
      text: "The council approved the new budget after a long debate this week.",
      urls: ["https://reuters.com/x"],
    });
    expect(classifyMessage(m)).toBe("news");
  });

  it("falls back to other for empty posts", () => {
    expect(classifyMessage(msg({ date: D, text: "" }))).toBe("other");
  });
});
