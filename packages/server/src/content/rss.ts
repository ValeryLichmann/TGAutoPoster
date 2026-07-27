import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date | null;
  summary: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  // CDATA / attributed nodes come through as objects with #text
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Atom `link` can be a string, an object with @_href, or an array of those. */
function atomLink(v: unknown): string {
  for (const l of asArray(v as never)) {
    if (typeof l === "string") return l;
    const o = l as Record<string, unknown>;
    if (o?.["@_rel"] === undefined || o?.["@_rel"] === "alternate") {
      if (typeof o?.["@_href"] === "string") return o["@_href"] as string;
    }
  }
  const first = asArray(v as never)[0] as Record<string, unknown> | undefined;
  return typeof first?.["@_href"] === "string" ? (first["@_href"] as string) : "";
}

/**
 * Parse an RSS 2.0 or Atom feed into normalized items. Pure — no I/O — so it's
 * unit-testable; `fetchFeed` wraps it with the network call.
 */
export function parseFeed(xml: string): FeedItem[] {
  let doc: Record<string, never>;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const anyDoc = doc as Record<string, Record<string, unknown>>;

  // RSS 2.0
  const rssItems = asArray(anyDoc.rss?.channel && (anyDoc.rss.channel as Record<string, unknown>).item);
  if (rssItems.length) {
    return rssItems.map((raw) => {
      const it = raw as Record<string, unknown>;
      return {
        title: stripHtml(text(it.title)),
        link: text(it.link).trim(),
        publishedAt: parseDate(text(it.pubDate)),
        summary: stripHtml(text(it.description) || text(it["content:encoded"])).slice(0, 800),
      };
    });
  }

  // Atom
  const entries = asArray(anyDoc.feed?.entry);
  if (entries.length) {
    return entries.map((raw) => {
      const it = raw as Record<string, unknown>;
      return {
        title: stripHtml(text(it.title)),
        link: atomLink(it.link),
        publishedAt: parseDate(text(it.updated) || text(it.published)),
        summary: stripHtml(text(it.summary) || text(it.content)).slice(0, 800),
      };
    });
  }

  return [];
}

/** Heuristic: does this URL look like a feed rather than an article/page? */
export function looksLikeFeed(url: string): boolean {
  return /(\.(xml|rss|atom)([?#]|$))|(\/(feed|rss|atom)s?\/?([?#]|$))/i.test(url);
}

export async function fetchFeed(url: string, timeoutMs = 10_000): Promise<FeedItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "TGAutoPoster/0.1 (+content pipeline)" },
  });
  if (!res.ok) throw new Error(`Feed fetch ${res.status} for ${url}`);
  return parseFeed(await res.text());
}
