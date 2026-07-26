import type { ChannelAnalysis, ScheduleSlot, Source } from "@tgap/shared";
import type { TextRequest } from "./types.js";

/**
 * Prompt builders. Everything the AI is told is assembled here so it can be
 * surfaced verbatim to the admin ("see the prompts, edit and append") — nothing
 * about generation is hidden. Each builder embeds a `[[TASK:...]]` marker used by
 * the mock provider and useful for logging/tracing.
 */

/** A sensible default, editable style prompt derived from the analysis. */
export function defaultStylePrompt(analysis: ChannelAnalysis, slot: ScheduleSlot): string {
  const s = analysis.styleProfile;
  return [
    `You write ${slot.postType} posts for the Telegram channel "${analysis.channelTitle}".`,
    `Match its established voice: tone is ${s.tone}; typical length ~${s.avgLengthChars} characters;`,
    `${s.usesHashtags ? "use 1–3 relevant hashtags" : "avoid hashtags"};`,
    `emoji use is ${s.emojiDensity > 1.5 ? "generous" : "sparing"}.`,
    `Write in the channel's original language. Be accurate and never invent facts not in the sources.`,
  ].join(" ");
}

export function buildPostGenerationPrompt(opts: {
  stylePrompt: string;
  sources: Source[];
  topic: string;
  sourceContent?: string;
}): TextRequest {
  const sourceLines = opts.sources
    .map((s) => `- ${s.title} (${s.url})${s.prompt ? ` — admin note: ${s.prompt}` : ""}`)
    .join("\n");
  const prompt = [
    `[[TASK:generate_post]]`,
    `TOPIC: ${opts.topic}`,
    ``,
    `Approved sources:`,
    sourceLines || "(none configured)",
    opts.sourceContent ? `\nSource material:\n${opts.sourceContent}` : "",
    ``,
    `Write one ready-to-publish post. Output only the post text (with emoji/hashtags as appropriate).`,
  ].join("\n");
  return { system: opts.stylePrompt, prompt, maxTokens: 700, temperature: 0.7 };
}

export function buildImagePrompt(opts: { postText: string; imageStylePrompt: string }): string {
  const base = opts.imageStylePrompt || "clean, modern editorial illustration, subtle tech aesthetic";
  const gist = opts.postText.replace(/\s+/g, " ").slice(0, 200);
  return `${base}. Illustrate: ${gist}. No text in the image.`;
}

export function buildSourceInvestigationPrompt(opts: {
  channelTitle: string;
  domains: string[];
  topicHint: string;
}): TextRequest {
  const domainLines = opts.domains.map((d) => `DOMAIN: ${d}`).join("\n");
  const prompt = [
    `[[TASK:investigate_sources]]`,
    `Channel: ${opts.channelTitle}`,
    `Topic hint: ${opts.topicHint}`,
    ``,
    `The channel frequently cites these domains:`,
    domainLines || "(none)",
    ``,
    `For each, decide whether it's a genuine primary content source. Also propose up to 3`,
    `additional high-quality sources (RSS/website/Telegram) that fit this channel's topic.`,
    `Return strict JSON: {"sources":[{"title","url","kind","rationale","confidence"}]}.`,
  ].join("\n");
  return {
    system:
      "You are a research assistant that identifies and verifies content sources. Respond with valid JSON only.",
    prompt,
    maxTokens: 1200,
    temperature: 0.3,
  };
}

export function buildScheduleConfirmationPrompt(analysis: ChannelAnalysis): TextRequest {
  return {
    system:
      "You explain a detected posting schedule to a channel owner in a friendly, concise way and ask them to confirm.",
    prompt: [
      `[[TASK:confirm_schedule]]`,
      `Analysis summary: ${analysis.narrative}`,
      `Slots: ${analysis.slots.map((s) => s.label).join("; ")}`,
    ].join("\n"),
    maxTokens: 400,
  };
}
