import type { PostDraft, SlotConfig, Source } from "@tgap/shared";
import type { AiClient } from "./types.js";
import { buildImagePrompt, buildPostGenerationPrompt } from "./prompts.js";

export interface GenerateDraftInput {
  channelId: string;
  slot: SlotConfig;
  sources: Source[];
  topic: string;
  /** Optional fetched source material (RSS item, article excerpt). */
  sourceContent?: string;
  now?: Date;
}

/**
 * Generate a single post draft: writes the text with the (transparent, editable)
 * style prompt, then — if the slot wants an image — an accompanying picture. The
 * exact prompt used is stored on the draft so the admin can inspect it.
 */
export async function generatePostDraft(
  ai: AiClient,
  input: GenerateDraftInput,
): Promise<PostDraft> {
  const now = input.now ?? new Date();
  const approved = input.sources.filter((s) => s.approved);
  const req = buildPostGenerationPrompt({
    stylePrompt: input.slot.stylePrompt,
    sources: approved,
    topic: input.topic,
    sourceContent: input.sourceContent,
  });

  const text = await ai.text.complete(req);

  let imageUrl: string | null = null;
  let imagePrompt: string | null = null;
  if (input.slot.withImage) {
    imagePrompt = buildImagePrompt({ postText: text, imageStylePrompt: input.slot.imageStylePrompt });
    try {
      imageUrl = (await ai.image.generate({ prompt: imagePrompt })).url;
    } catch {
      imageUrl = null; // non-fatal: publish text-only if image gen fails
    }
  }

  return {
    id: `draft_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    channelId: input.channelId,
    slotId: input.slot.slotId,
    postType: input.slot.postType,
    text,
    imageUrl,
    imagePrompt,
    generationPrompt: `SYSTEM:\n${req.system}\n\nUSER:\n${req.prompt}`,
    sourceIds: approved.map((s) => s.id),
    status: "pending",
    scheduledFor: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
