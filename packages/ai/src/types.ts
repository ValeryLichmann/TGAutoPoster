/** Provider-agnostic AI interfaces. Concrete providers (Anthropic, OpenAI, mock)
 * implement these so the rest of the app never hard-codes a vendor. */

export interface TextRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
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

export interface AiClient {
  text: TextProvider;
  image: ImageProvider;
  /** True when running against mock providers (no external calls). */
  readonly mock: boolean;
}
