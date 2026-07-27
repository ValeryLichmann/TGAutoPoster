import type { PostDraft, SlotConfig } from "@tgap/shared";
import {
  createAiClient,
  generatePostDraft,
  generateStyleGuide,
  selectExamples,
  type AiClient,
  type AiUsageEvent,
} from "@tgap/ai";
import { config } from "./config.js";
import { gatherSourceMaterial } from "./content/pipeline.js";
import type { Channel, Store } from "./store.js";

/** Estimate a call's USD cost from configured per-MTok prices. */
function costOf(u: AiUsageEvent): number {
  if (u.tier === "image") return u.images * config.prices.imageEach;
  const inRate = u.tier === "fast" ? config.prices.fastIn : config.prices.smartIn;
  const outRate = u.tier === "fast" ? config.prices.fastOut : config.prices.smartOut;
  return (
    (u.inputTokens / 1_000_000) * inRate +
    (u.cacheReadTokens / 1_000_000) * inRate * 0.1 +
    (u.outputTokens / 1_000_000) * outRate
  );
}

let aiSingleton: AiClient | null = null;
let usageStore: Store | null = null;

/** The app-wide AI client. Usage of every call flows into the store's totals. */
export function getAi(store: Store): AiClient {
  usageStore = store;
  if (!aiSingleton) {
    aiSingleton = createAiClient(config.ai, (u) => {
      usageStore?.addUsage({
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        images: u.images,
        costUsd: costOf(u),
      });
    });
  }
  return aiSingleton;
}

export type GenerateResult = { ok: true; draft: PostDraft } | { ok: false; reason: string };

/**
 * The one generation path used by the API, the bot and the scheduler:
 * gather fresh grounded material from approved sources, assemble the channel's
 * style guide + its own posts as examples + owner corrections, and produce a
 * draft. News-type slots refuse to generate without fresh material — grounded
 * or nothing.
 */
export async function generateForSlot(
  store: Store,
  channel: Channel,
  slot: SlotConfig,
  topic?: string,
): Promise<GenerateResult> {
  const ai = getAi(store);
  const sources = store.sources.get(channel.id) ?? [];
  const approved = sources.filter((s) => s.approved);

  const material = approved.length
    ? await gatherSourceMaterial({ sources: approved, seen: store.seenFor(channel.id) }).catch(() => null)
    : null;

  // News/digest posts without fresh material would be invented stories — refuse
  // in live mode (mock mode allows ungrounded drafts so the demo flows).
  const needsMaterial = slot.postType === "news" || slot.postType === "digest";
  if (needsMaterial && !material && !topic && !ai.mock) {
    return { ok: false, reason: "No fresh source material found — add or approve sources (RSS works best)." };
  }

  // Lazily create the style guide the first time we generate for this channel.
  if (!channel.styleGuide) {
    try {
      channel.styleGuide = await generateStyleGuide(ai, channel.analysis, channel.historySample);
      store.persist();
    } catch {
      channel.styleGuide = ""; // fall back to the slot's style prompt
    }
  }

  const draft = await generatePostDraft(ai, {
    channelId: channel.id,
    slot,
    sources,
    topic: topic ?? material?.headline ?? `today's ${slot.postType}`,
    styleGuide: channel.styleGuide || undefined,
    examples: selectExamples(channel.historySample, slot.postType),
    corrections: store.edits.get(channel.id) ?? [],
    items: material?.items,
  });

  const list = store.drafts.get(channel.id) ?? [];
  list.push(draft);
  store.drafts.set(channel.id, list);
  store.persist();
  return { ok: true, draft };
}
