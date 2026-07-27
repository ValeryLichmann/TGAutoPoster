/**
 * Minimal article-text extraction: fetch a page and return its readable text.
 * Deliberately dependency-free — strips chrome (scripts, nav, footer), prefers
 * the <article> element when present, and caps length. Good enough to ground a
 * post in the actual content rather than a headline; swap in a full readability
 * library later if needed.
 */

export function extractText(html: string, maxChars = 4000): string {
  let scope = html;
  const article = /<article[\s\S]*?<\/article>/i.exec(html);
  if (article) scope = article[0];
  const main = !article && /<main[\s\S]*?<\/main>/i.exec(html);
  if (main) scope = main[0];

  const text = scope
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|svg|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();

  return text.slice(0, maxChars);
}

export async function fetchArticleText(
  url: string,
  maxChars = 4000,
  timeoutMs = 10_000,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "TGAutoPoster/0.1 (+content pipeline)" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    const text = extractText(await res.text(), maxChars);
    return text.length >= 200 ? text : null;
  } catch {
    return null;
  }
}
