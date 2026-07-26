/**
 * Production history ingester via MTProto (GramJS).
 *
 * The Telegram Bot API cannot page backwards through a channel's history, so to
 * analyse ≥ 1 year we log in as a *user* (read-only) with GramJS and page
 * `messages.getHistory`. This file documents the adapter shape; it deliberately
 * does not hard-depend on `telegram` (GramJS) to keep the default install light.
 *
 * To enable:
 *   1. pnpm --filter @tgap/server add telegram
 *   2. Get api_id / api_hash at https://my.telegram.org
 *   3. Generate a StringSession once:  pnpm --filter @tgap/server tg:login
 *   4. Put TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_STRING_SESSION in .env
 *   5. In ingest/index.ts, return `new MtprotoIngester(...)` when a session exists.
 *
 * Sketch of fetchHistory (with GramJS installed):
 *
 *   import { TelegramClient } from "telegram";
 *   import { StringSession } from "telegram/sessions";
 *
 *   const client = new TelegramClient(
 *     new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5 },
 *   );
 *   await client.connect();
 *   const entity = await client.getEntity(handle);
 *   const cutoff = Date.now() - days * 86_400_000;
 *   const records: MessageRecord[] = [];
 *   for await (const msg of client.iterMessages(entity, { limit: undefined })) {
 *     if (msg.date * 1000 < cutoff) break;
 *     records.push(normalize(msg, channelId)); // -> MessageRecord
 *   }
 *   return records;
 *
 * `normalize` maps GramJS message fields onto MessageRecord: text/caption,
 * media kind, grouped_id (albums), views/forwards/reactions, entities → urls,
 * hashtags, fwd_from → isForward/forwardFrom.
 */
export const MTPROTO_SETUP_HINT =
  "MTProto ingestion is not configured. Add the `telegram` package and set TELEGRAM_STRING_SESSION. See ingest/mtproto.ts.";
