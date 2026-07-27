import { InlineKeyboard } from "grammy";
import type { PostDraft } from "@tgap/shared";

/** Inline confirm/edit/decline/regenerate keyboard for a draft. Shared by the
 * conversational bot and the scheduler's owner notifications. */
export function draftKeyboard(draft: PostDraft): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", `d:approve:${draft.id}`)
    .text("✏️ Edit", `d:edit:${draft.id}`)
    .row()
    .text("🔄 Regenerate", `d:regenerate:${draft.id}`)
    .text("❌ Decline", `d:decline:${draft.id}`);
}

export function renderDraft(draft: PostDraft): string {
  const img = draft.imageUrl ? "\n\n🖼 (image attached)" : "";
  return `*Draft — ${draft.postType}*\n\n${draft.text}${img}`;
}
