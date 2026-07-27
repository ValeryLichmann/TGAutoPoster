/**
 * One-time interactive login that mints a GramJS StringSession for read-only
 * history ingestion:
 *
 *   1. Get api_id / api_hash at https://my.telegram.org → API development tools
 *   2. Put TELEGRAM_API_ID and TELEGRAM_API_HASH in .env
 *   3. pnpm --filter @tgap/server tg:login
 *   4. Paste the printed session string into TELEGRAM_STRING_SESSION in .env
 *
 * The session string is a credential — treat it like a password.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "../config.js";

async function main() {
  console.log("TGAutoPoster — Telegram user login (StringSession generator)\n");
  if (!config.apiId || !config.apiHash) {
    console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first (https://my.telegram.org).");
    process.exit(1);
  }

  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions/index.js");
  const rl = createInterface({ input: stdin, output: stdout });

  const client = new TelegramClient(new StringSession(""), Number(config.apiId), config.apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: () => rl.question("Phone number (with country code): "),
    password: () => rl.question("2FA password (empty if none): "),
    phoneCode: () => rl.question("Code you received: "),
    onError: (err) => console.error("Login error:", err.message),
  });

  console.log("\n✅ Logged in. Put this in .env as TELEGRAM_STRING_SESSION:\n");
  console.log(client.session.save());
  console.log("\n(keep it secret — it grants read access to this account)");
  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
