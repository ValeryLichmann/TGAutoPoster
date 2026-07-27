import type { Source } from "@tgap/shared";
import type { GroundedItem } from "@tgap/ai";
import { fetchArticleText } from "./article.js";
import { fetchFeed, looksLikeFeed } from "./rss.js";

export interface SourceMaterial {
  items: GroundedItem[];
  /** Best headline among the items — used as the draft topic. */
  headline: string;
}

export interface GatherOptions {
  sources: Source[];
  /** Links already used in earlier drafts (dedup). Mutated: new links are added. */
  seen: Set<string>;
  maxItems?: number;
  /** Only items younger than this count as fresh. */
  freshHours?: number;
  now?: Date;
}

/**
 * The grounding step: pull fresh, unseen items from the channel's approved
 * sources (RSS preferred; article extraction for the top item) so generation
 * rewrites real content instead of inventing it. Returns null when nothing
 * fresh is available — callers should then skip news posts rather than
 * hallucinate.
 */
export async function gatherSourceMaterial(opts: GatherOptions): Promise<SourceMaterial | null> {
  const now = opts.now ?? new Date();
  const maxItems = opts.maxItems ?? 3;
  const freshMs = (opts.freshHours ?? 48) * 3600_000;
  const items: GroundedItem[] = [];

  const feedSources = opts.sources.filter(
    (s) => s.approved && (s.kind === "rss" || looksLikeFeed(s.url) || s.kind === "website"),
  );

  for (const source of feedSources.slice(0, 5)) {
    if (items.length >= maxItems) break;
    let feedItems;
    try {
      feedItems = await fetchFeed(source.kind === "rss" || looksLikeFeed(source.url)
        ? source.url
        : guessFeedUrl(source.url));
    } catch {
      continue; // dead feed — skip silently, other sources may work
    }

    const fresh = feedItems.filter(
      (it) =>
        it.link &&
        !opts.seen.has(it.link) &&
        (it.publishedAt === null || now.getTime() - it.publishedAt.getTime() < freshMs),
    );

    for (const it of fresh.slice(0, 2)) {
      if (items.length >= maxItems) break;
      opts.seen.add(it.link);
      // Fetch full article text for the first (lead) item only — cost control.
      const article = items.length === 0 ? await fetchArticleText(it.link) : null;
      items.push({
        title: it.title || it.link,
        url: it.link,
        excerpt: article ?? it.summary ?? "",
        sourceTitle: source.title,
        sourcePrompt: source.prompt || undefined,
      });
    }
  }

  if (!items.length) return null;
  return { items, headline: items[0]!.title };
}

/** Common feed locations for a bare website source. */
function guessFeedUrl(url: string): string {
  const base = url.replace(/\/+$/, "");
  return `${base}/feed`;
}
