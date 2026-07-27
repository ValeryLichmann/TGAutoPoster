/**
 * @tgap/ai — vendor-agnostic AI layer. Text (analysis, post writing, source
 * investigation, style guides) and image generation sit behind interfaces; the
 * factory picks real providers when API keys are present and deterministic mocks
 * otherwise, so the whole product runs with zero keys during development.
 *
 * Cost design: two text tiers (fast for routine posts, smart for long-form and
 * one-time work), Anthropic prompt caching on the per-channel style prefix, and
 * a usage hook that reports every call's tokens for spend tracking.
 */
import { AnthropicTextProvider } from "./providers/anthropic.js";
import { OpenAiImageProvider } from "./providers/openai-images.js";
import { MockImageProvider, MockTextProvider } from "./providers/mock.js";
import type { AiClient, UsageHook } from "./types.js";

export * from "./types.js";
export * from "./prompts.js";
export * from "./style.js";
export { generatePostDraft, type GenerateDraftInput } from "./generate.js";
export { investigateSources } from "./investigate.js";

export interface AiEnv {
  AI_MODE?: string; // auto | mock | live
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL_SMART?: string;
  ANTHROPIC_MODEL_FAST?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
}

/**
 * Build an {@link AiClient} from environment. `mock` forces mocks; `live`
 * requires keys; `auto` (default) uses whatever keys are available and mocks the
 * rest. `onUsage` receives every call's token/image spend.
 */
export function createAiClient(env: AiEnv = process.env as AiEnv, onUsage?: UsageHook): AiClient {
  const mode = (env.AI_MODE ?? "auto").toLowerCase();
  const wantMock = mode === "mock";
  const wantLive = mode === "live";

  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  const hasOpenAi = !!env.OPENAI_API_KEY;

  if (wantLive && (!hasAnthropic || !hasOpenAi)) {
    throw new Error("AI_MODE=live requires ANTHROPIC_API_KEY and OPENAI_API_KEY");
  }

  const text =
    !wantMock && hasAnthropic
      ? new AnthropicTextProvider({
          apiKey: env.ANTHROPIC_API_KEY!,
          smartModel: env.ANTHROPIC_MODEL_SMART,
          fastModel: env.ANTHROPIC_MODEL_FAST,
          onUsage,
        })
      : new MockTextProvider(onUsage);

  const image =
    !wantMock && hasOpenAi
      ? new OpenAiImageProvider(env.OPENAI_API_KEY!, env.OPENAI_IMAGE_MODEL, onUsage)
      : new MockImageProvider(onUsage);

  return { text, image, mock: text.name === "mock" && image.name === "mock" };
}
