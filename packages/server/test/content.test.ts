import { describe, expect, it } from "vitest";
import { looksLikeFeed, parseFeed } from "../src/content/rss.js";
import { extractText } from "../src/content/article.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
<item>
  <title>First story</title>
  <link>https://example.com/a</link>
  <pubDate>Mon, 21 Jul 2025 10:00:00 GMT</pubDate>
  <description><![CDATA[<p>Summary of <b>first</b> story.</p>]]></description>
</item>
<item>
  <title>Second story</title>
  <link>https://example.com/b</link>
  <description>Plain summary</description>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom entry</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <updated>2025-07-20T08:00:00Z</updated>
    <summary>Atom summary here</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 items with CDATA + HTML stripped", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("First story");
    expect(items[0]!.link).toBe("https://example.com/a");
    expect(items[0]!.summary).toBe("Summary of first story.");
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[1]!.publishedAt).toBeNull();
  });

  it("parses Atom entries with attributed links", () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://example.com/atom-1");
    expect(items[0]!.summary).toBe("Atom summary here");
  });

  it("returns empty for junk", () => {
    expect(parseFeed("not xml at all")).toEqual([]);
  });
});

describe("looksLikeFeed", () => {
  it("recognises feed-ish urls", () => {
    expect(looksLikeFeed("https://x.com/rss.xml")).toBe(true);
    expect(looksLikeFeed("https://x.com/feed")).toBe(true);
    expect(looksLikeFeed("https://x.com/blog/post-1")).toBe(false);
  });
});

describe("extractText", () => {
  it("prefers <article> content and strips chrome", () => {
    const html = `<html><head><script>evil()</script><style>.x{}</style></head><body>
      <nav>Menu Menu</nav>
      <article><h1>Headline</h1><p>Body paragraph one.</p><p>Body two &amp; more.</p></article>
      <footer>© footer</footer></body></html>`;
    const text = extractText(html);
    expect(text).toContain("Headline");
    expect(text).toContain("Body paragraph one.");
    expect(text).toContain("Body two & more.");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("footer");
    expect(text).not.toContain("evil");
  });

  it("caps length", () => {
    const html = `<article>${"word ".repeat(5000)}</article>`;
    expect(extractText(html, 1000).length).toBeLessThanOrEqual(1000);
  });
});
