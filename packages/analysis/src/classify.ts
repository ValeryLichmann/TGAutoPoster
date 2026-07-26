import type { MessageRecord, PostType } from "@tgap/shared";

/** Words that hint at promotional content, across a few common languages. */
const PROMO_HINTS = [
  "sponsor",
  "promo",
  "discount",
  "sale",
  "buy now",
  "coupon",
  "affiliate",
  "advertisement",
  "#ad",
  "sponsored",
  "реклама",
  "скидк",
  "промокод",
];

const ANNOUNCE_HINTS = [
  "we are",
  "we're excited",
  "launching",
  "introducing",
  "join us",
  "webinar",
  "event",
  "release",
  "анонс",
  "запуск",
];

const DIGEST_HINTS = ["digest", "roundup", "weekly", "top ", "дайджест", "итоги", "подборка"];
const ANALYSIS_HINTS = ["analysis", "why ", "deep dive", "breakdown", "разбор", "почему"];

function containsAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/** Count leading list markers ("1.", "- ", "•") — a signal for digests. */
function listItemCount(text: string): number {
  return text.split("\n").filter((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l)).length;
}

/**
 * Heuristic post-type classifier. Deliberately dependency-free and deterministic
 * so it can run at ingestion time without an AI call; the AI layer can later
 * refine ambiguous ("other") cases. Returns a best-effort {@link PostType}.
 */
export function classifyMessage(m: MessageRecord): PostType {
  const text = m.text ?? "";
  const len = text.trim().length;

  if (m.hasPoll) return "poll";
  if (containsAny(text, PROMO_HINTS)) return "promo";

  // Media-forward: has media and little text.
  if (m.media !== "none" && len < 120) return "media";

  if (DIGEST_HINTS.some((h) => text.toLowerCase().startsWith(h)) || listItemCount(text) >= 3) {
    return "digest";
  }
  if (containsAny(text, ANNOUNCE_HINTS)) return "announcement";
  if (containsAny(text, ANALYSIS_HINTS) && len > 500) return "analysis";

  // News: outward link + moderate length, time-sensitive framing.
  if (m.urls.length > 0 && len >= 60) return "news";

  // Short standalone text.
  if (len > 0 && len < 160 && m.urls.length === 0) {
    return text.includes("?") ? "question" : "quote";
  }
  if (len >= 600) return "analysis";
  if (len >= 160) return "news";

  return "other";
}
