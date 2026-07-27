import "dotenv/config";

/** Central typed access to environment configuration. */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? "development",
  miniappUrl: process.env.MINIAPP_URL ?? "http://localhost:5173",

  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  apiId: process.env.TELEGRAM_API_ID ?? "",
  apiHash: process.env.TELEGRAM_API_HASH ?? "",
  stringSession: process.env.TELEGRAM_STRING_SESSION ?? "",

  sessionSecret: process.env.SESSION_JWT_SECRET ?? "dev-secret",
  adminUserIds: (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  freeTrialDays: Number(process.env.FREE_TRIAL_DAYS ?? 3),
  freeTierDailyPosts: Number(process.env.FREE_TIER_DAILY_POSTS ?? 1),
  proMonthlyStars: Number(process.env.PRO_MONTHLY_STARS ?? 250),

  /** JSON persistence file; empty string disables persistence (tests). */
  dataFile: process.env.DATA_FILE ?? "data/store.json",

  /** Minutes a semi-autopilot draft waits before auto-publishing. */
  semiPublishDelayMin: Number(process.env.SEMI_PUBLISH_DELAY_MIN ?? 15),
  /** Scheduler tick interval (seconds). */
  schedulerTickSec: Number(process.env.SCHEDULER_TICK_SEC ?? 30),

  ai: {
    AI_MODE: process.env.AI_MODE,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL_SMART: process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-5",
    ANTHROPIC_MODEL_FAST: process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
  },

  /**
   * Per-MTok USD prices for cost estimates (defaults: Sonnet 5 $3/$15,
   * Haiku 4.5 $1/$5; cache reads ~0.1× input). Override via env when prices
   * change — these only drive the admin-panel estimate, not billing.
   */
  prices: {
    smartIn: Number(process.env.PRICE_SMART_IN ?? 3),
    smartOut: Number(process.env.PRICE_SMART_OUT ?? 15),
    fastIn: Number(process.env.PRICE_FAST_IN ?? 1),
    fastOut: Number(process.env.PRICE_FAST_OUT ?? 5),
    imageEach: Number(process.env.PRICE_IMAGE ?? 0.04),
  },
};

export function isAdmin(userId: string): boolean {
  return config.adminUserIds.includes(userId);
}
