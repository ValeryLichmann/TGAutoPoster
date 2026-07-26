import type { ImageProvider, ImageRequest, ImageResult, TextProvider, TextRequest } from "../types.js";

/**
 * Deterministic mock providers so the entire product runs end-to-end with no API
 * keys (AI_MODE=mock, or "auto" with no keys set). The text mock branches on a
 * `[[TASK:...]]` marker the prompt builders embed, and returns realistic,
 * schema-shaped output for each task.
 */
export class MockTextProvider implements TextProvider {
  readonly name = "mock";

  async complete(req: TextRequest): Promise<string> {
    const task = /\[\[TASK:([a-z_]+)\]\]/.exec(req.prompt)?.[1] ?? "generic";
    switch (task) {
      case "generate_post":
        return this.mockPost(req.prompt);
      case "investigate_sources":
        return this.mockSources(req.prompt);
      case "confirm_schedule":
        return "Here's the schedule I detected. Reply ✅ to confirm, or tell me what to change.";
      default:
        return "(mock) " + req.prompt.slice(0, 80);
    }
  }

  private mockPost(prompt: string): string {
    const topic = /TOPIC:\s*(.+)/.exec(prompt)?.[1]?.trim() ?? "today's top story";
    return [
      `📰 ${topic}`,
      "",
      "A concise, on-brand take generated in mock mode — this is where the AI would",
      "summarise the source, add context, and match your channel's voice.",
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
}

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

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
    return { url, provider: this.name };
  }
}
