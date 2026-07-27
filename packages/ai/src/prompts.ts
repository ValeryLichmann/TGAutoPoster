import type { ChannelAnalysis, PostType, ScheduleSlot, Source } from "@tgap/shared";
import type { EditPair } from "./style.js";
import { formatCorrections } from "./style.js";
import type { ModelTier, TextRequest } from "./types.js";

/**
 * Prompt builders. Everything the AI is told is assembled here so it can be
 * surfaced verbatim to the admin ("see the prompts, edit and append") — nothing
 * about generation is hidden. Each builder embeds a `[[TASK:...]]` marker used by
 * the mock provider and useful for logging/tracing.
 */

/** Cheap model for routine short posts; smart model for long-form. */
export function tierForPostType(t: PostType): ModelTier {
  return t === "digest" || t === "analysis" || t === "announcement" ? "smart" : "fast";
}

/** A sensible default, editable style prompt derived from the analysis — used
 * until the full AI style guide has been generated. */
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

/** One fetched piece of source material feeding a grounded draft. */
export interface GroundedItem {
  title: string;
  url: string;
  excerpt: string;
  sourceTitle: string;
  /** The admin's custom prompt attached to this source, if any. */
  sourcePrompt?: string;
}

export interface PostGenerationOptions {
  /** The channel's style guide (AI-generated or admin-edited) or the slot's style prompt. */
  styleGuide: string;
  /** The channel's own posts of this type, best first. */
  examples?: string[];
  /** Recent admin edits to learn from. */
  corrections?: EditPair[];
  sources: Source[];
  topic: string;
  postType: PostType;
  /** Fresh fetched source material. When present the draft is grounded: only
   * facts from these items may be used. */
  items?: GroundedItem[];
}

export function buildPostGenerationPrompt(opts: PostGenerationOptions): TextRequest {
  // System = stable per-channel content (style guide + examples + corrections)
  // so Anthropic prompt caching makes repeat generations cheap.
  const exampleBlock = opts.examples?.length
    ? `\n\n## Examples of this channel's real ${opts.postType} posts — imitate them\n` +
      opts.examples.map((e, i) => `--- example ${i + 1} ---\n${e}`).join("\n")
    : "";
  const system =
    `${opts.styleGuide}${exampleBlock}${formatCorrections(opts.corrections ?? [])}\n\n` +
    `## Hard rules\n` +
    `- Output only the post text, ready to publish. No preamble, no commentary.\n` +
    `- Never invent facts. If source material is provided, use only facts from it and include its link.\n` +
    `- Match the language of the example posts.`;

  const itemBlocks = (opts.items ?? [])
    .map((it) =>
      [
        `### ITEM: ${it.title}`,
        `LINK: ${it.url}`,
        `FROM: ${it.sourceTitle}${it.sourcePrompt ? ` — admin note: ${it.sourcePrompt}` : ""}`,
        it.excerpt,
      ].join("\n"),
    )
    .join("\n\n");

  const sourceLines = opts.sources
    .map((s) => `- ${s.title} (${s.url})${s.prompt ? ` — admin note: ${s.prompt}` : ""}`)
    .join("\n");

  const prompt = [
    `[[TASK:generate_post]]`,
    `TOPIC: ${opts.topic}`,
    `POST TYPE: ${opts.postType}`,
    ``,
    opts.items?.length
      ? `Fresh source material (base the post ONLY on this):\n\n${itemBlocks}`
      : `Approved sources for context:\n${sourceLines || "(none configured)"}`,
    ``,
    `Write one ready-to-publish ${opts.postType} post.`,
  ].join("\n");

  return {
    system,
    prompt,
    maxTokens: 700,
    tier: tierForPostType(opts.postType),
    cacheSystem: true,
  };
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
    `For each, decide whether it's a genuine primary content source and find its RSS feed URL if one`,
    `exists. Also propose up to 3 additional high-quality sources (RSS/website/Telegram) that fit`,
    `this channel's topic. Prefer RSS URLs — they can be fetched automatically.`,
    `Return strict JSON: {"sources":[{"title","url","kind","rationale","confidence"}]}.`,
  ].join("\n");
  return {
    system:
      "You are a research assistant that identifies and verifies content sources. Respond with valid JSON only.",
    prompt,
    maxTokens: 1200,
    tier: "smart",
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
    tier: "fast",
  };
}
