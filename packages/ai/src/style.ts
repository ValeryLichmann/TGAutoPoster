import type { ChannelAnalysis, MessageRecord, PostType } from "@tgap/shared";
import { classifyMessage } from "@tgap/analysis";
import type { AiClient, TextRequest } from "./types.js";

/** A recorded admin edit — used as feedback so the model learns preferences. */
export interface EditPair {
  before: string;
  after: string;
}

/**
 * Pick the channel's own best posts of a given type to use as few-shot
 * examples. Showing the model real posts beats describing the style: engagement
 * (views/reactions/forwards) ranks them, recency breaks ties.
 */
export function selectExamples(history: MessageRecord[], postType: PostType, n = 4): string[] {
  const engagement = (m: MessageRecord) =>
    (m.views ?? 0) + 10 * (m.reactions ?? 0) + 5 * (m.forwards ?? 0);
  return history
    .filter((m) => m.text.trim().length >= 40 && classifyMessage(m) === postType)
    .sort((a, b) => engagement(b) - engagement(a) || b.date.localeCompare(a.date))
    .slice(0, n)
    .map((m) => truncate(m.text, 600));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function buildStyleGuidePrompt(
  analysis: ChannelAnalysis,
  samplePosts: string[],
): TextRequest {
  const samples = samplePosts
    .slice(0, 30)
    .map((p, i) => `--- post ${i + 1} ---\n${truncate(p, 500)}`)
    .join("\n");
  return {
    system:
      "You are an editorial analyst. You read a Telegram channel's posts and produce a precise, " +
      "actionable style guide another writer could follow to be indistinguishable from the original author.",
    prompt: [
      `[[TASK:style_guide]]`,
      `Channel: ${analysis.channelTitle}`,
      `Measured profile: tone=${analysis.styleProfile.tone}; avg ${analysis.styleProfile.avgLengthChars} chars/post; ` +
        `emoji density ${analysis.styleProfile.emojiDensity}; hashtags=${analysis.styleProfile.usesHashtags}; ` +
        `link share ${analysis.styleProfile.linksOutShare}.`,
      ``,
      `Representative posts:`,
      samples || "(none available)",
      ``,
      `Write a markdown style guide with sections: Voice, Structure, Formatting, Language, Never.`,
      `Be concrete (sentence length, emoji rules, hashtag habits, how links are presented, signature phrases).`,
      `Write it in the second person ("you write..."). Output only the guide.`,
    ].join("\n"),
    maxTokens: 1200,
    tier: "smart",
  };
}

/**
 * Generate (or regenerate) the channel's editable style guide from its own
 * history. Runs once per channel on the smart tier; the result is cached on the
 * channel and reused (with prompt caching) for every generation after.
 */
export async function generateStyleGuide(
  ai: AiClient,
  analysis: ChannelAnalysis,
  history: MessageRecord[],
): Promise<string> {
  const samples = history
    .filter((m) => m.text.trim().length >= 40)
    .sort((a, b) => ((b.views ?? 0) - (a.views ?? 0)))
    .slice(0, 30)
    .map((m) => m.text);
  return ai.text.complete(buildStyleGuidePrompt(analysis, samples));
}

/** Render admin edit feedback for inclusion in the generation system prompt. */
export function formatCorrections(edits: EditPair[]): string {
  if (!edits.length) return "";
  const rows = edits
    .slice(-3)
    .map(
      (e, i) =>
        `Correction ${i + 1}:\nDraft you wrote:\n${truncate(e.before, 400)}\nOwner's edit:\n${truncate(e.after, 400)}`,
    )
    .join("\n\n");
  return `\n\n## Owner corrections — learn from these\nThe channel owner edited earlier drafts. Match the owner's version, not yours:\n${rows}`;
}
