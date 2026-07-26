import type { ChannelAnalysis, Source } from "@tgap/shared";
import type { AiClient } from "./types.js";
import { buildSourceInvestigationPrompt } from "./prompts.js";

interface RawSource {
  title?: string;
  url?: string;
  kind?: string;
  rationale?: string;
  confidence?: number;
}

const VALID_KINDS = new Set(["rss", "website", "telegram", "twitter", "reddit", "other"]);

/**
 * Ask the AI to verify the channel's most-cited domains and propose additional
 * fitting sources, returning enriched {@link Source} records (origin
 * "ai_investigated", still unapproved — the admin reviews them). Falls back to an
 * empty list if the model returns unparseable output.
 */
export async function investigateSources(
  ai: AiClient,
  analysis: ChannelAnalysis,
  now: Date = new Date(),
): Promise<Source[]> {
  const req = buildSourceInvestigationPrompt({
    channelTitle: analysis.channelTitle,
    domains: analysis.topDomains.map((d) => d.domain),
    topicHint: analysis.styleProfile.tone,
  });
  const raw = await ai.text.complete(req);

  let parsed: { sources?: RawSource[] };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return [];
  }

  return (parsed.sources ?? [])
    .filter((s): s is RawSource & { url: string } => typeof s.url === "string" && s.url.length > 0)
    .map((s, i) => ({
      id: `src_ai_${i}`,
      channelId: analysis.channelId,
      kind: (VALID_KINDS.has(s.kind ?? "") ? s.kind : "website") as Source["kind"],
      title: s.title ?? s.url,
      url: s.url,
      origin: "ai_investigated",
      approved: false,
      prompt: "",
      rationale: s.rationale ?? "",
      confidence: clamp01(s.confidence ?? 0.6),
      createdAt: now.toISOString(),
    }));
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
