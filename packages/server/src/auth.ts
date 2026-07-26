import { createHmac } from "node:crypto";
import { config } from "./config.js";

export interface TgUser {
  id: string;
  displayName: string;
}

/**
 * Validate Telegram Mini App `initData` per the official algorithm: the data-check
 * string is HMAC-SHA256'd with a key derived from the bot token, and compared to
 * the provided hash. Returns the authenticated user or null.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string): TgUser | null {
  if (!config.botToken) {
    // Dev convenience: no bot token configured → accept a demo identity so the
    // Mini App is usable locally. Never triggers in production (token present).
    if (config.nodeEnv !== "production") return demoUser(initData);
    return null;
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    const u = JSON.parse(userJson) as { id: number; first_name?: string; username?: string };
    return { id: String(u.id), displayName: u.username ?? u.first_name ?? `user${u.id}` };
  } catch {
    return null;
  }
}

function demoUser(initData: string): TgUser {
  // Allow ?demo_uid=... passthrough for testing multiple identities locally.
  const uid = new URLSearchParams(initData).get("demo_uid") ?? config.adminUserIds[0] ?? "1";
  return { id: uid, displayName: "Demo User" };
}
