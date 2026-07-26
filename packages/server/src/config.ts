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

  ai: {
    AI_MODE: process.env.AI_MODE,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
  },
};

export function isAdmin(userId: string): boolean {
  return config.adminUserIds.includes(userId);
}
