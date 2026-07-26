import { Bot, InlineKeyboard, type Context } from "grammy";
import type { PostDraft } from "@tgap/shared";
import { createAiClient, generatePostDraft } from "@tgap/ai";
import { config } from "./config.js";
import { checkAccess, recordUsage } from "./entitlement.js";
import type { Store } from "./store.js";

const ai = createAiClient(config.ai);
const policy = { trialDays: config.freeTrialDays, freeDailyLimit: config.freeTierDailyPosts };

/** Users mid-way through an inline "edit" (awaiting their replacement text). */
const pendingEdit = new Map<string, string>(); // telegramUserId -> draftId

function draftKeyboard(draft: PostDraft): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", `d:approve:${draft.id}`)
    .text("✏️ Edit", `d:edit:${draft.id}`)
    .row()
    .text("🔄 Regenerate", `d:regenerate:${draft.id}`)
    .text("❌ Decline", `d:decline:${draft.id}`);
}

function renderDraft(draft: PostDraft): string {
  const img = draft.imageUrl ? "\n\n🖼 (image attached)" : "";
  return `*Draft — ${draft.postType}*\n\n${draft.text}${img}`;
}

/**
 * Build the grammY bot: /start opens the Mini App, /connect analyses a channel,
 * /generate produces a draft the admin confirms/edits/declines inline. Returns
 * null (no-op) when TELEGRAM_BOT_TOKEN is unset so the server still boots.
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
        "and draft posts for you to confirm.\n\nOpen the app or connect a channel to begin.",
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
    await ctx.reply("✍️ Generating a draft…");
    const draft = await generatePostDraft(ai, {
      channelId: channel.id,
      slot,
      sources: store.sources.get(channel.id) ?? [],
      topic: ctx.match?.trim() || "today's top story",
    });
    (store.drafts.get(channel.id) ?? store.drafts.set(channel.id, []).get(channel.id)!).push(draft);
    store.setEntitlement(recordUsage(ent));
    await ctx.reply(renderDraft(draft), { parse_mode: "Markdown", reply_markup: draftKeyboard(draft) });
  });

  // Draft inline actions: d:<action>:<draftId>
  bot.callbackQuery(/^d:(approve|decline|edit|regenerate):(.+)$/, async (ctx) => {
    const [, action, draftId] = ctx.match!;
    const found = findDraft(store, draftId!);
    if (!found) return ctx.answerCallbackQuery({ text: "Draft not found" });
    const { channelId, draft } = found;

    if (action === "approve") {
      draft.status = "approved";
      await ctx.answerCallbackQuery({ text: "Approved ✅" });
      await ctx.editMessageText(`✅ *Approved & queued*\n\n${draft.text}`, { parse_mode: "Markdown" });
    } else if (action === "decline") {
      draft.status = "declined";
      await ctx.answerCallbackQuery({ text: "Declined" });
      await ctx.editMessageText("❌ Draft declined.");
    } else if (action === "edit") {
      pendingEdit.set(String(ctx.from.id), draftId!);
      await ctx.answerCallbackQuery();
      await ctx.reply("Send me the edited text and I'll replace this draft.");
    } else if (action === "regenerate") {
      await ctx.answerCallbackQuery({ text: "Regenerating…" });
      const slot = (store.slots.get(channelId) ?? [])[0];
      if (slot) {
        const fresh = await generatePostDraft(ai, {
          channelId,
          slot,
          sources: store.sources.get(channelId) ?? [],
          topic: "today's top story",
        });
        store.drafts.get(channelId)!.push(fresh);
        await ctx.reply(renderDraft(fresh), { parse_mode: "Markdown", reply_markup: draftKeyboard(fresh) });
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

  // Capture edited text when a user is mid-edit.
  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from.id);
    const draftId = pendingEdit.get(userId);
    if (!draftId) return;
    pendingEdit.delete(userId);
    const found = findDraft(store, draftId);
    if (!found) return;
    found.draft.text = ctx.message.text;
    found.draft.status = "edited";
    found.draft.updatedAt = new Date().toISOString();
    await ctx.reply(`Updated ✏️`, { reply_markup: draftKeyboard(found.draft) });
  });

  return bot;
}

async function handleConnect(ctx: Context, store: Store, handle: string) {
  const userId = String(ctx.from?.id ?? "");
  await ctx.reply(`🔎 Analysing ${handle} — reading up to a year of history…`);
  const channel = await store.connectChannel(handle, userId);
  const a = channel.analysis;
  await ctx.reply(
    `*${a.channelTitle}* analysed ✅\n\n${a.narrative}\n\n` +
      `I set up ${a.slots.length} posting slot(s). Use /generate to see a draft, ` +
      `or open the app to review sources, schedule and prompts.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().webApp("Open app", config.miniappUrl) },
  );
}

function findDraft(store: Store, id: string): { channelId: string; draft: PostDraft } | null {
  for (const [channelId, list] of store.drafts) {
    const draft = list.find((d) => d.id === id);
    if (draft) return { channelId, draft };
  }
  return null;
}
