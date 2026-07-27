import { InputFile, type Bot } from "grammy";
import type { PostDraft } from "@tgap/shared";
import { config } from "./config.js";
import { nextFire, occurrenceKey, parseCadence } from "./cadence.js";
import { checkAccess, recordUsage } from "./entitlement.js";
import { generateForSlot } from "./generation.js";
import type { Channel, Store } from "./store.js";
import { draftKeyboard, renderDraft } from "./botui.js";

const policy = { trialDays: config.freeTrialDays, freeDailyLimit: config.freeTierDailyPosts };

/**
 * The autopilot engine. Every tick it:
 *  1. fires due slots — generates a grounded draft per slot occurrence and
 *     routes it by the channel's autopilot mode:
 *       manual → pending + DM the owner with confirm/edit/decline buttons
 *       semi   → approved, publishes after a grace window unless declined
 *       auto   → approved, publishes on the next tick ("replaces the admin")
 *  2. publishes approved drafts whose time has come — real sendMessage/sendPhoto
 *     to the channel when a bot is configured, demo-marked otherwise.
 * Occurrence keys are persisted so restarts never double-post.
 */
export function startScheduler(store: Store, bot: Bot | null) {
  let running = false;

  const tick = async () => {
    if (running) return; // don't overlap slow ticks
    running = true;
    try {
      await fireDueSlots(store, bot);
      await publishDue(store, bot);
    } catch (err) {
      console.error("scheduler tick error:", err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, config.schedulerTickSec * 1000);
  void tick();
  console.log(`▶ Scheduler running (tick ${config.schedulerTickSec}s)`);
  return {
    stop: () => clearInterval(timer),
    tickOnce: tick,
  };
}

async function fireDueSlots(store: Store, bot: Bot | null) {
  const now = new Date();
  // Look back one tick + a minute so a fire isn't missed between ticks.
  const windowStart = new Date(now.getTime() - (config.schedulerTickSec + 60) * 1000);

  for (const channel of store.channels.values()) {
    for (const slot of store.slots.get(channel.id) ?? []) {
      if (!slot.enabled) continue;
      const cadence = parseCadence(slot.cadence);
      const due = nextFire(cadence, windowStart);
      if (!due || due > now) continue;

      const key = occurrenceKey(slot.slotId, due);
      if (store.firedKeys.has(key)) continue;
      store.markFired(key);

      await fireSlot(store, bot, channel, slot.slotId, due).catch((err) =>
        console.error(`slot ${slot.slotId} fire failed:`, err),
      );
    }
  }
}

async function fireSlot(store: Store, bot: Bot | null, channel: Channel, slotId: string, due: Date) {
  const slot = (store.slots.get(channel.id) ?? []).find((s) => s.slotId === slotId);
  if (!slot) return;

  // Entitlement gate: autopilot respects the freemium quota too.
  const ent = store.ensureEntitlement(channel.ownerId);
  const access = checkAccess(ent, policy);
  if (!access.allowed) {
    await notifyOwner(bot, channel.ownerId, `⏸ Skipped a scheduled ${slot.postType} post: ${access.reason}`);
    return;
  }

  const result = await generateForSlot(store, channel, slot);
  if (!result.ok) {
    await notifyOwner(bot, channel.ownerId, `⏸ Skipped a scheduled ${slot.postType} post: ${result.reason}`);
    return;
  }
  store.setEntitlement(recordUsage(ent));

  const draft = result.draft;
  const mode = channel.settings.autopilot;
  const nowIso = new Date().toISOString();

  if (mode === "auto") {
    draft.status = "approved";
    draft.scheduledFor = nowIso;
    await notifyOwner(
      bot,
      channel.ownerId,
      `🤖 Autopilot: publishing this ${slot.postType} to *${channel.title}* now:\n\n${draft.text.slice(0, 500)}`,
    );
  } else if (mode === "semi") {
    draft.status = "approved";
    draft.scheduledFor = new Date(Date.now() + config.semiPublishDelayMin * 60_000).toISOString();
    await notifyOwnerDraft(
      bot,
      channel.ownerId,
      draft,
      `⏳ Publishing to *${channel.title}* in ${config.semiPublishDelayMin} min unless you decline:`,
    );
  } else {
    // manual — draft stays pending, owner decides via buttons
    await notifyOwnerDraft(bot, channel.ownerId, draft, `📝 Scheduled ${slot.postType} draft for *${channel.title}* (due ${due.toISOString().slice(11, 16)} UTC):`);
  }
  draft.updatedAt = nowIso;
  store.persist();
}

async function publishDue(store: Store, bot: Bot | null) {
  const now = Date.now();
  for (const [channelId, drafts] of store.drafts) {
    for (const draft of drafts) {
      const approved = draft.status === "approved" || draft.status === "edited";
      if (!approved || !draft.scheduledFor) continue;
      if (new Date(draft.scheduledFor).getTime() > now) continue;
      await publishDraft(store, bot, channelId, draft);
    }
  }
}

/** Publish one draft to the real channel (bot must be channel admin). */
export async function publishDraft(store: Store, bot: Bot | null, channelId: string, draft: PostDraft) {
  const channel = store.channels.get(channelId);
  try {
    if (bot) {
      const png = draft.imageUrl?.startsWith("data:image/png;base64,")
        ? Buffer.from(draft.imageUrl.slice("data:image/png;base64,".length), "base64")
        : null;
      if (png && draft.text.length <= 1024) {
        await bot.api.sendPhoto(channelId, new InputFile(png, "post.png"), { caption: draft.text });
      } else {
        await bot.api.sendMessage(channelId, draft.text);
        if (png) await bot.api.sendPhoto(channelId, new InputFile(png, "post.png"));
      }
    } else {
      console.log(`▶ [demo publish] ${channelId}: ${draft.text.slice(0, 80)}…`);
    }
    draft.status = "published";
    draft.updatedAt = new Date().toISOString();
    store.persist();
    if (channel) await notifyOwner(bot, channel.ownerId, `✅ Published to *${channel.title}*.`);
  } catch (err) {
    draft.status = "failed";
    draft.updatedAt = new Date().toISOString();
    store.persist();
    const hint = bot
      ? "Is the bot an admin of the channel with post permission?"
      : "";
    if (channel) {
      await notifyOwner(
        bot,
        channel.ownerId,
        `❌ Failed to publish to *${channel.title}*: ${(err as Error).message}. ${hint}`,
      );
    }
  }
}

async function notifyOwner(bot: Bot | null, ownerId: string, text: string) {
  if (!bot) return;
  try {
    await bot.api.sendMessage(ownerId, text, { parse_mode: "Markdown" });
  } catch {
    /* owner hasn't started the bot — nothing we can do */
  }
}

async function notifyOwnerDraft(bot: Bot | null, ownerId: string, draft: PostDraft, header: string) {
  if (!bot) return;
  try {
    await bot.api.sendMessage(ownerId, `${header}\n\n${renderDraft(draft)}`, {
      parse_mode: "Markdown",
      reply_markup: draftKeyboard(draft),
    });
  } catch {
    /* owner hasn't started the bot */
  }
}
