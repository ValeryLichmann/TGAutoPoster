import type {
  ImageProvider,
  ImageRequest,
  ImageResult,
  TextProvider,
  TextRequest,
  UsageHook,
} from "../types.js";

/**
 * Deterministic mock providers so the entire product runs end-to-end with no API
 * keys (AI_MODE=mock, or "auto" with no keys set). The text mock branches on a
 * `[[TASK:...]]` marker the prompt builders embed, and returns realistic,
 * schema-shaped output for each task — including grounded generation, which
 * echoes the fetched source items so the pipeline is visibly exercised.
 */
export class MockTextProvider implements TextProvider {
  readonly name = "mock";
  constructor(private readonly onUsage?: UsageHook) {}

  async complete(req: TextRequest): Promise<string> {
    const task = /\[\[TASK:([a-z_]+)\]\]/.exec(req.prompt)?.[1] ?? "generic";
    let out: string;
    switch (task) {
      case "generate_post":
        out = this.mockPost(req.prompt);
        break;
      case "investigate_sources":
        out = this.mockSources(req.prompt);
        break;
      case "style_guide":
        out = this.mockStyleGuide(req.prompt);
        break;
      case "confirm_schedule":
        out = "Here's the schedule I detected. Reply ✅ to confirm, or tell me what to change.";
        break;
      default:
        out = "(mock) " + req.prompt.slice(0, 80);
    }
    this.onUsage?.({
      provider: this.name,
      model: "mock",
      tier: req.tier ?? "smart",
      inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4),
      outputTokens: Math.ceil(out.length / 4),
      cacheReadTokens: 0,
      images: 0,
    });
    return out;
  }

  private mockPost(prompt: string): string {
    // Grounded mode: echo the first fetched item so grounding is visible.
    const item = /### ITEM: (.+)/.exec(prompt)?.[1]?.trim();
    const link = /LINK: (\S+)/.exec(prompt)?.[1];
    const topic = item ?? /TOPIC:\s*(.+)/.exec(prompt)?.[1]?.trim() ?? "today's top story";
    return [
      `📰 ${topic}`,
      "",
      item
        ? "A concise, on-brand rewrite of the source above — in live mode the AI restates only facts from the fetched material, in your channel's voice."
        : "A concise, on-brand take generated in mock mode — no fresh source material was provided for this draft.",
      ...(link ? ["", `🔗 ${link}`] : []),
      "",
      "#news #update",
    ].join("\n");
  }

  private mockSources(prompt: string): string {
    const domains = [...prompt.matchAll(/DOMAIN:\s*([^\s]+)/g)].map((m) => m[1]);
    const list = (domains.length ? domains : ["reuters.com", "bloomberg.com"]).map((d) => ({
      title: d,
      url: `https://${d}`,
      kind: d?.includes("t.me") ? "telegram" : "website",
      rationale: `Frequently cited; appears to be a primary news source for this channel's topic.`,
      confidence: 0.8,
    }));
    return JSON.stringify({ sources: list }, null, 2);
  }

  private mockStyleGuide(prompt: string): string {
    const title = /Channel:\s*(.+)/.exec(prompt)?.[1]?.trim() ?? "this channel";
    return [
      `# Style guide — ${title}`,
      "",
      "## Voice",
      "- Direct, newsy, confident. No filler, no throat-clearing.",
      "- Sentences are short. One idea per line.",
      "",
      "## Structure",
      "- Lead with the headline fact, then 1–2 lines of context.",
      "- End with the source link on its own line.",
      "",
      "## Formatting",
      "- 1 emoji at the start of the post, none mid-sentence.",
      "- 1–3 hashtags at the end, lowercase.",
      "",
      "## Never",
      "- Never invent facts not present in the source material.",
      "- Never use clickbait phrasing (\"you won't believe…\").",
    ].join("\n");
  }
}

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  constructor(private readonly onUsage?: UsageHook) {}

  async generate(req: ImageRequest): Promise<ImageResult> {
    // A tiny deterministic SVG placeholder encoded as a data URL.
    const label = req.prompt.slice(0, 40).replace(/[<>&]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="20"
text-anchor="middle">${label}</text></svg>`;
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    this.onUsage?.({
      provider: this.name,
      model: "mock",
      tier: "image",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      images: 1,
    });
    return { url, provider: this.name };
  }
}
