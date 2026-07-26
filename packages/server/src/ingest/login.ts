/**
 * One-time helper to mint a GramJS StringSession for read-only history ingestion.
 * Requires the optional `telegram` (GramJS) package:
 *
 *   pnpm --filter @tgap/server add telegram input
 *   pnpm --filter @tgap/server tg:login
 *
 * With GramJS installed, replace the body below with the standard interactive
 * login (see https://gram.js.org/ "String Sessions"):
 *
 *   const client = new TelegramClient(new StringSession(""), apiId, apiHash, {});
 *   await client.start({ phoneNumber, password, phoneCode, onError });
 *   console.log(client.session.save());   // <- put this in TELEGRAM_STRING_SESSION
 */
import { config } from "../config.js";

console.log("TGAutoPoster — Telegram user login (StringSession generator)\n");
if (!config.apiId || !config.apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first (https://my.telegram.org).");
  process.exit(1);
}
console.log(
  "This helper needs the optional GramJS package. Install it, then follow the\n" +
    "instructions in src/ingest/login.ts to complete the interactive login.",
);
