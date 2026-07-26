import type { Source } from "@tgap/shared";
import type { AnnotatedMessage } from "./stats.js";
import { topDomains } from "./stats.js";

/**
 * Derive *candidate* sources purely from the domains/forwards the channel cites.
 * These are deterministic guesses (origin: "ai_guessed", unapproved) that the AI
 * layer can later enrich (resolve RSS feeds, add rationale) and the admin
 * reviews in the Mini App. Kept dependency-free so it runs at ingestion time.
 */
export function candidateSources(
  channelId: string,
  annotated: AnnotatedMessage[],
  now: Date = new Date(),
): Source[] {
  const domains = topDomains(annotated, 12).filter((d) => d.count >= 2);
  const total = annotated.length || 1;
  return domains.map((d, i) => {
    const isTelegram = d.domain.startsWith("t.me/");
    const share = d.count / total;
    return {
      id: `src_cand_${i}`,
      channelId,
      kind: isTelegram ? "telegram" : "website",
      title: d.domain,
      url: isTelegram ? `https://${d.domain}` : `https://${d.domain}`,
      origin: "ai_guessed",
      approved: false,
      prompt: "",
      rationale: `Cited in ${d.count} posts (${(share * 100).toFixed(0)}% of history).`,
      confidence: Number(Math.min(0.95, 0.4 + share).toFixed(2)),
      createdAt: now.toISOString(),
    } satisfies Source;
  });
}
