/**
 * @tgap/ai — vendor-agnostic AI layer. Text (analysis, post writing, source
 * investigation) and image generation sit behind interfaces; the factory picks
 * real providers when API keys are present and deterministic mocks otherwise, so
 * the whole product runs with zero keys during development.
 */
import { AnthropicTextProvider } from "./providers/anthropic.js";
import { GeminiTextProvider } from "./providers/gemini.js";
import { OpenAiImageProvider } from "./providers/openai-images.js";
import { MockImageProvider, MockTextProvider } from "./providers/mock.js";
import type { AiClient } from "./types.js";

export * from "./types.js";
export * from "./prompts.js";
export { generatePostDraft, type GenerateDraftInput } from "./generate.js";
export { investigateSources } from "./investigate.js";

export interface AiEnv {
  AI_MODE?: string; // auto | mock | live
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
}

/**
 * Build an {@link AiClient} from environment. `mock` forces mocks; `live`
 * requires keys; `auto` (default) uses whatever keys are available and mocks the
 * rest. For text, Anthropic is preferred when present, otherwise Gemini (whose
 * Google AI Studio key has a free tier) is used.
 */
export function createAiClient(env: AiEnv = process.env as AiEnv): AiClient {
  const mode = (env.AI_MODE ?? "auto").toLowerCase();
  const wantMock = mode === "mock";
  const wantLive = mode === "live";

  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  const hasGemini = !!env.GEMINI_API_KEY;
  const hasText = hasAnthropic || hasGemini;
  const hasOpenAi = !!env.OPENAI_API_KEY;

  if (wantLive && (!hasText || !hasOpenAi)) {
    throw new Error(
      "AI_MODE=live requires a text key (ANTHROPIC_API_KEY or GEMINI_API_KEY) and OPENAI_API_KEY",
    );
  }

  let text;
  if (wantMock || !hasText) {
    text = new MockTextProvider();
  } else if (hasAnthropic) {
    text = new AnthropicTextProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);
  } else {
    text = new GeminiTextProvider(env.GEMINI_API_KEY!, env.GEMINI_MODEL);
  }

  const image =
    !wantMock && hasOpenAi
      ? new OpenAiImageProvider(env.OPENAI_API_KEY!, env.OPENAI_IMAGE_MODEL)
      : new MockImageProvider();

  return { text, image, mock: text.name === "mock" && image.name === "mock" };
}
