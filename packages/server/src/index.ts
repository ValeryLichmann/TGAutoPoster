import { config } from "./config.js";
import { buildApi } from "./api.js";
import { buildBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { createSeededStore } from "./store.js";

async function main() {
  const store = await createSeededStore();

  const app = await buildApi(store);
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`▶ TGAutoPoster API listening on http://localhost:${config.port}`);

  const bot = buildBot(store);
  if (bot) {
    void bot.start({ onStart: () => console.log("▶ Telegram bot started (long polling)") });
  } else {
    console.log("ℹ TELEGRAM_BOT_TOKEN not set — bot disabled, API + Mini App still work.");
  }

  const scheduler = startScheduler(store, bot);

  const shutdown = () => {
    scheduler.stop();
    store.saveNow();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
