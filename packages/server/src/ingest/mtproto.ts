import type { MediaKind, MessageRecord } from "@tgap/shared";
import type { HistoryIngester } from "./index.js";

const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

export interface MtprotoConfig {
  apiId: number;
  apiHash: string;
  stringSession: string;
}

/**
 * Production history ingester via MTProto (GramJS). The Bot API cannot page
 * backwards through a channel's history, so to analyse ≥ 1 year we connect as a
 * read-only *user* session and iterate `messages.getHistory`.
 *
 * Setup: get api_id/api_hash at https://my.telegram.org, then run
 * `pnpm --filter @tgap/server tg:login` once to mint TELEGRAM_STRING_SESSION.
 * GramJS is imported lazily so installs without it still boot (falling back to
 * the synthetic ingester).
 */
export class MtprotoIngester implements HistoryIngester {
  readonly name = "mtproto";
  // GramJS has no bundled strict types for our use pattern; keep it loose.
  private client: { connected?: boolean } & Record<string, any> = {} as never;
  private connected = false;

  constructor(private readonly cfg: MtprotoConfig) {}

  private async connect() {
    if (this.connected) return;
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js");
    this.client = new TelegramClient(
      new StringSession(this.cfg.stringSession),
      this.cfg.apiId,
      this.cfg.apiHash,
      { connectionRetries: 3 },
    ) as never;
    await (this.client as any).connect();
    this.connected = true;
  }

  async resolveChannel(handle: string): Promise<{ channelId: string; title: string }> {
    await this.connect();
    const entity = await (this.client as any).getEntity(handle);
    return {
      channelId: `-100${entity.id.toString()}`,
      title: entity.title ?? entity.username ?? handle.replace(/^@/, ""),
    };
  }

  async fetchHistory(channelId: string, days = 400): Promise<MessageRecord[]> {
    await this.connect();
    const entity = await (this.client as any).getEntity(channelId.replace(/^-100/, ""));
    const cutoff = Date.now() / 1000 - days * 86_400;
    const records: MessageRecord[] = [];

    for await (const msg of (this.client as any).iterMessages(entity, { waitTime: 1 })) {
      if (typeof msg.date === "number" && msg.date < cutoff) break;
      if (!msg.message && !msg.media) continue; // service messages
      records.push(normalize(msg, channelId));
      if (records.length >= 20_000) break; // hard safety cap
    }
    return records.reverse(); // oldest first, as the analysis engine expects
  }
}

function normalize(msg: any, channelId: string): MessageRecord {
  const text: string = msg.message ?? "";
  const mediaClass: string = msg.media?.className ?? "";

  let media: MediaKind = "none";
  if (mediaClass === "MessageMediaPhoto") media = "photo";
  else if (mediaClass === "MessageMediaDocument") {
    const mime: string = msg.media?.document?.mimeType ?? "";
    media = mime.startsWith("video/") ? "video" : mime === "image/gif" ? "animation" : "document";
  }
  if (msg.groupedId) media = media === "none" ? "album" : media;

  const reactions =
    msg.reactions?.results?.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0) ?? null;

  return {
    id: Number(msg.id),
    channelId,
    date: new Date((msg.date ?? 0) * 1000).toISOString(),
    text,
    media,
    groupedId: msg.groupedId ? String(msg.groupedId) : null,
    views: msg.views ?? null,
    forwards: msg.forwards ?? null,
    reactions,
    urls: text.match(URL_RE) ?? [],
    hashtags: (text.match(HASHTAG_RE) ?? []).map((h: string) => h.slice(1)),
    hasPoll: mediaClass === "MessageMediaPoll",
    isForward: !!msg.fwdFrom,
    forwardFrom: msg.fwdFrom?.fromName ?? null,
  };
}
