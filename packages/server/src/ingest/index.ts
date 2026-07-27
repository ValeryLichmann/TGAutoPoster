import type { MessageRecord } from "@tgap/shared";
import { config } from "../config.js";
import { syntheticHistory } from "./synthetic.js";
import { MtprotoIngester } from "./mtproto.js";

/**
 * Reading long channel history requires MTProto (the Bot API cannot read past
 * history). Implementations abstract that away: the GramJS adapter when a user
 * session is configured, a synthetic year of history otherwise (keyless demo).
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

/** MTProto when a user session is configured, synthetic otherwise. */
export function createIngester(opts: { stringSession?: string }): HistoryIngester {
  if (opts.stringSession && config.apiId && config.apiHash) {
    return new MtprotoIngester({
      apiId: Number(config.apiId),
      apiHash: config.apiHash,
      stringSession: opts.stringSession,
    });
  }
  return new SyntheticIngester();
}
