import type { MessageRecord } from "@tgap/shared";
import { syntheticHistory } from "./synthetic.js";

/**
 * Reading long channel history requires MTProto (the Bot API cannot page back
 * through history). Implementations abstract that away. See `mtproto.ts` for the
 * production GramJS adapter and `synthetic.ts` for the keyless demo path.
 */
export interface HistoryIngester {
  readonly name: string;
  /** Resolve a channel @username or id to a stable channel id + title. */
  resolveChannel(handle: string): Promise<{ channelId: string; title: string }>;
  /** Fetch up to `days` of history (default 400 to cover "at least a year"). */
  fetchHistory(channelId: string, days?: number): Promise<MessageRecord[]>;
}

/** Keyless ingester used in dev/demo — returns a synthetic year of history. */
export class SyntheticIngester implements HistoryIngester {
  readonly name = "synthetic";
  async resolveChannel(handle: string) {
    const clean = handle.replace(/^@/, "");
    return { channelId: `-100${hash(clean)}`, title: clean };
  }
  async fetchHistory(channelId: string): Promise<MessageRecord[]> {
    return syntheticHistory(channelId);
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(h % 10_000_000_000);
}

/**
 * Pick an ingester from config. Currently returns the synthetic one; wire the
 * GramJS adapter (see mtproto.ts) once TELEGRAM_STRING_SESSION is provided.
 */
export function createIngester(opts: { stringSession?: string }): HistoryIngester {
  // if (opts.stringSession) return new MtprotoIngester(...);
  return new SyntheticIngester();
}
