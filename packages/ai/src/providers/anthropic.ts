import Anthropic from "@anthropic-ai/sdk";
import type { TextProvider, TextRequest, UsageHook } from "../types.js";

export interface AnthropicOptions {
  apiKey: string;
  /** Strong model for digests/analysis/style guides. */
  smartModel?: string;
  /** Cheap+quick model for routine posts. */
  fastModel?: string;
  onUsage?: UsageHook;
}

/**
 * Anthropic text provider via the official SDK, with model tiering (fast/smart)
 * and prompt caching on the system block. No sampling params are sent — current
 * Claude models reject non-default temperature/top_p.
 */
export class AnthropicTextProvider implements TextProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly smartModel: string;
  private readonly fastModel: string;
  private readonly onUsage?: UsageHook;

  constructor(opts: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.smartModel = opts.smartModel ?? "claude-sonnet-5";
    this.fastModel = opts.fastModel ?? "claude-haiku-4-5";
    this.onUsage = opts.onUsage;
  }

  async complete(req: TextRequest): Promise<string> {
    const tier = req.tier ?? "smart";
    const model = tier === "fast" ? this.fastModel : this.smartModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 1024,
      system: [
        {
          type: "text" as const,
          text: req.system,
          ...(req.cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}),
        },
      ],
      messages: [{ role: "user", content: req.prompt }],
    });

    this.onUsage?.({
      provider: this.name,
      model,
      tier,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      images: 0,
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
}
