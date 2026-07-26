import { config } from "./config.js";
import { buildApi } from "./api.js";
import { buildBot } from "./bot.js";
import { createSeededStore } from "./store.js";

async function main() {
  const store = await createSeededStore();

  const app = await buildApi(store);
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.warn(`API on :${config.port} (AI: ${config.ai.ANTHROPIC_API_KEY ? "live" : "mock"})`);
  // eslint-disable-next-line no-console
  console.log(`▶ TGAutoPoster API listening on http://localhost:${config.port}`);

  const bot = buildBot(store);
  if (bot) {
    void bot.start({ onStart: () => console.log("▶ Telegram bot started (long polling)") });
  } else {
    console.log("ℹ TELEGRAM_BOT_TOKEN not set — bot disabled, API + Mini App still work.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
