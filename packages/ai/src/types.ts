/** Provider-agnostic AI interfaces. Concrete providers (Anthropic, OpenAI, mock)
 * implement these so the rest of the app never hard-codes a vendor. */

/**
 * Cost tier for a text request. "fast" maps to a cheap/quick model (routine
 * news rewrites), "smart" to a stronger model (digests, analysis, style guides).
 */
export type ModelTier = "fast" | "smart";

export interface TextRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  tier?: ModelTier;
  /**
   * Cache the system block (Anthropic prompt caching). Set for per-channel
   * stable content — the style guide + examples — so repeated generations pay
   * ~0.1x for that prefix.
   */
  cacheSystem?: boolean;
}

export interface TextProvider {
  readonly name: string;
  complete(req: TextRequest): Promise<string>;
}

export interface ImageRequest {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}

export interface ImageResult {
  /** Either a hosted URL or a data: URL. */
  url: string;
  provider: string;
}

export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

/** One AI call's spend, reported through the usage hook for cost tracking. */
export interface AiUsageEvent {
  provider: string;
  model: string;
  tier: ModelTier | "image";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  images: number;
}

export type UsageHook = (u: AiUsageEvent) => void;

export interface AiClient {
  text: TextProvider;
  image: ImageProvider;
  /** True when running against mock providers (no external calls). */
  readonly mock: boolean;
}
