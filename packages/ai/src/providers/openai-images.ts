import type { ImageProvider, ImageRequest, ImageResult, UsageHook } from "../types.js";

/**
 * OpenAI image generation (gpt-image-1 / DALL·E) via fetch. Returns a data: URL
 * so callers don't depend on OpenAI's hosting. Only used when OPENAI_API_KEY is
 * set; otherwise the mock image provider returns a deterministic SVG placeholder.
 */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly onUsage?: UsageHook;
  private readonly endpoint = "https://api.openai.com/v1/images/generations";

  constructor(apiKey: string, model = "gpt-image-1", onUsage?: UsageHook) {
    this.apiKey = apiKey;
    this.model = model;
    this.onUsage = onUsage;
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: req.prompt,
        size: req.size ?? "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI image error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];

    this.onUsage?.({
      provider: this.name,
      model: this.model,
      tier: "image",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      images: 1,
    });

    if (first?.b64_json) return { url: `data:image/png;base64,${first.b64_json}`, provider: this.name };
    if (first?.url) return { url: first.url, provider: this.name };
    throw new Error("OpenAI image response contained no image");
  }
}
