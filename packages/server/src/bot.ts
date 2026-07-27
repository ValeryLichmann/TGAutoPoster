import { Bot, InlineKeyboard, type Context } from "grammy";
import type { AutopilotMode } from "@tgap/shared";
import { config } from "./config.js";
import { checkAccess, recordUsage } from "./entitlement.js";
import { generateForSlot } from "./generation.js";
import type { Store } from "./store.js";
import { draftKeyboard, renderDraft } from "./botui.js";

const policy = { trialDays: config.freeTrialDays, freeDailyLimit: config.freeTierDailyPosts };

/** Users mid-way through an inline "edit" (awaiting their replacement text). */
const pendingEdit = new Map<string, string>(); // telegramUserId -> draftId

/**
 * Build the grammY bot: /start opens the Mini App, /connect analyses a channel,
 * /generate produces a grounded draft the admin confirms/edits/declines inline,
 * /autopilot switches the channel's autonomy mode. Returns null (no-op) when
 * TELEGRAM_BOT_TOKEN is unset so the server still boots.
 */
export function buildBot(store: Store): Bot | null {
  if (!config.botToken) return null;
  const bot = new Bot(config.botToken);

  bot.command("start", async (ctx) => {
    const kb = new InlineKeyboard()
      .webApp("🚀 Open TGAutoPoster", config.miniappUrl)
      .row()
      .text("🔗 Connect a channel", "connect");
    await ctx.reply(
      "Welcome to *TGAutoPoster* — I analyse your channel, learn its schedule & style, " +
        "and draft posts for you to confirm — or publish them for you on autopilot.\n\n" +
        "Commands: /connect /generate /autopilot",
      { parse_mode: "Markdown", reply_markup: kb },
    );
  });

  bot.command("connect", async (ctx) => {
    const handle = ctx.match?.trim();
    if (!handle) return ctx.reply("Usage: /connect @yourchannel");
    await handleConnect(ctx, store, handle);
  });

  bot.callbackQuery("connect", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Send me your channel as: /connect @yourchannel");
  });

  bot.command("generate", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const channel = store.channelsOf(userId)[0];
    if (!channel) return ctx.reply("Connect a channel first: /connect @yourchannel");

    const ent = store.ensureEntitlement(userId);
    const access = checkAccess(ent, policy);
    if (!access.allowed) {
      const kb = new InlineKeyboard().text("⭐ Upgrade to Pro", "upgrade");
      return ctx.reply(`${access.reason}`, { reply_markup: kb });
    }

    const slot = (store.slots.get(channel.id) ?? [])[0];
    if (!slot) return ctx.reply("No posting slots detected for this channel yet.");
    await ctx.reply("✍️ Fetching sources & writing a draft…");
    const result = await generateForSlot(store, channel, slot, ctx.match?.trim() || undefined);
    if (!result.ok) return ctx.reply(`⏸ ${result.reason}`);
    store.setEntitlement(recordUsage(ent));
    await ctx.reply(renderDraft(result.draft), {
      parse_mode: "Markdown",
      reply_markup: draftKeyboard(result.draft),
    });
  });

  bot.command("autopilot", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const channel = store.channelsOf(userId)[0];
    if (!channel) return ctx.reply("Connect a channel first: /connect @yourchannel");
    const kb = new InlineKeyboard()
      .text(mark(channel.settings.autopilot, "manual") + " Manual", `ap:manual:${channel.id}`)
      .row()
      .text(mark(channel.settings.autopilot, "semi") + " Semi (grace window)", `ap:semi:${channel.id}`)
      .row()
      .text(mark(channel.settings.autopilot, "auto") + " Full auto", `ap:auto:${channel.id}`);
    await ctx.reply(
      `*Autopilot for ${channel.title}*\n\n` +
        `• *Manual* — every draft waits for your ✅\n` +
        `• *Semi* — drafts auto-publish after ${config.semiPublishDelayMin} min unless you decline\n` +
        `• *Full auto* — drafts publish immediately at slot times`,
      { parse_mode: "Markdown", reply_markup: kb },
    );
  });

  bot.callbackQuery(/^ap:(manual|semi|auto):(.+)$/, async (ctx) => {
    const [, mode, channelId] = ctx.match!;
    const channel = store.channels.get(channelId!);
    if (!channel) return ctx.answerCallbackQuery({ text: "Channel not found" });
    channel.settings.autopilot = mode as AutopilotMode;
    store.persist();
    await ctx.answerCallbackQuery({ text: `Autopilot: ${mode}` });
    await ctx.editMessageText(`✅ Autopilot for *${channel.title}* set to *${mode}*.`, {
      parse_mode: "Markdown",
    });
  });

  // Draft inline actions: d:<action>:<draftId>
  bot.callbackQuery(/^d:(approve|decline|edit|regenerate):(.+)$/, async (ctx) => {
    const [, action, draftId] = ctx.match!;
    const found = store.findDraft(draftId!);
    if (!found) return ctx.answerCallbackQuery({ text: "Draft not found" });
    const { channelId, draft } = found;

    if (action === "approve") {
      draft.status = "approved";
      // Publish on the scheduler's next tick.
      if (!draft.scheduledFor) draft.scheduledFor = new Date().toISOString();
      draft.updatedAt = new Date().toISOString();
      store.persist();
      await ctx.answerCallbackQuery({ text: "Approved ✅" });
      await ctx.editMessageText(`✅ *Approved — publishing shortly*\n\n${draft.text}`, {
        parse_mode: "Markdown",
      });
    } else if (action === "decline") {
      draft.status = "declined";
      draft.updatedAt = new Date().toISOString();
      store.persist();
      await ctx.answerCallbackQuery({ text: "Declined" });
      await ctx.editMessageText("❌ Draft declined.");
    } else if (action === "edit") {
      pendingEdit.set(String(ctx.from.id), draftId!);
      await ctx.answerCallbackQuery();
      await ctx.reply("Send me the edited text and I'll replace this draft.");
    } else if (action === "regenerate") {
      await ctx.answerCallbackQuery({ text: "Regenerating…" });
      const channel = store.channels.get(channelId);
      const slot = (store.slots.get(channelId) ?? []).find((s) => s.slotId === draft.slotId)
        ?? (store.slots.get(channelId) ?? [])[0];
      if (channel && slot) {
        const result = await generateForSlot(store, channel, slot);
        if (result.ok) {
          await ctx.reply(renderDraft(result.draft), {
            parse_mode: "Markdown",
            reply_markup: draftKeyboard(result.draft),
          });
        } else {
          await ctx.reply(`⏸ ${result.reason}`);
        }
      }
    }
  });

  bot.callbackQuery("upgrade", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `⭐ *Pro* — unlimited drafts, all sources, priority generation.\n` +
        `${config.proMonthlyStars} Stars / month. Open the app to subscribe.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().webApp("Open app", config.miniappUrl) },
    );
  });

  // Capture edited text when a user is mid-edit; the edit pair feeds the style
  // engine so future drafts match the owner's corrections.
  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from.id);
    const draftId = pendingEdit.get(userId);
    if (!draftId) return;
    pendingEdit.delete(userId);
    const found = store.findDraft(draftId);
    if (!found) return;
    store.recordEdit(found.channelId, { before: found.draft.text, after: ctx.message.text });
    found.draft.text = ctx.message.text;
    found.draft.status = "edited";
    found.draft.updatedAt = new Date().toISOString();
    store.persist();
    await ctx.reply(`Updated ✏️ — I'll learn from this edit.`, { reply_markup: draftKeyboard(found.draft) });
  });

  return bot;
}

function mark(current: AutopilotMode, mode: AutopilotMode): string {
  return current === mode ? "●" : "○";
}

async function handleConnect(ctx: Context, store: Store, handle: string) {
  const userId = String(ctx.from?.id ?? "");
  await ctx.reply(`🔎 Analysing ${handle} — reading up to a year of history…`);
  try {
    const channel = await store.connectChannel(handle, userId);
    const a = channel.analysis;
    await ctx.reply(
      `*${a.channelTitle}* analysed ✅\n\n${a.narrative}\n\n` +
        `I set up ${a.slots.length} posting slot(s). Use /generate for a draft, /autopilot to set ` +
        `autonomy, or open the app to review sources, schedule and prompts.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().webApp("Open app", config.miniappUrl) },
    );
  } catch (err) {
    await ctx.reply(`❌ Could not analyse ${handle}: ${(err as Error).message}`);
  }
}
