import type { TextProvider, TextRequest } from "../types.js";

/**
 * Minimal Google Gemini client (fetch-based, no SDK dependency so the package
 * stays light and transparent). Targets the Generative Language API used by
 * Google AI Studio keys, which has a free tier — a drop-in text provider for
 * users who don't have an Anthropic key. Only instantiated when GEMINI_API_KEY
 * is present; otherwise the factory falls back to the mock provider.
 */
export class GeminiTextProvider implements TextProvider {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly base = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(req: TextRequest): Promise<string> {
    const url = `${this.base}/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
  }
}
