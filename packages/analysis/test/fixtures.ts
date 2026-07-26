import type { MediaKind, MessageRecord } from "@tgap/shared";

let seq = 1;

export interface MsgOpts {
  date: Date;
  text?: string;
  media?: MediaKind;
  urls?: string[];
  hashtags?: string[];
  hasPoll?: boolean;
  isForward?: boolean;
  forwardFrom?: string | null;
}

export function msg(o: MsgOpts): MessageRecord {
  return {
    id: seq++,
    channelId: "-1001",
    date: o.date.toISOString(),
    text: o.text ?? "",
    media: o.media ?? "none",
    groupedId: null,
    views: 1000,
    forwards: 5,
    reactions: 20,
    urls: o.urls ?? [],
    hashtags: o.hashtags ?? [],
    hasPoll: o.hasPoll ?? false,
    isForward: o.isForward ?? false,
    forwardFrom: o.forwardFrom ?? null,
  };
}

/** UTC date at a given day offset from a base, at HH:MM. */
export function at(base: Date, dayOffset: number, hh: number, mm = 0): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

/** A newsy message with an outbound link to a source domain. */
export function newsMsg(date: Date, domain = "reuters.com"): MessageRecord {
  return msg({
    date,
    text: "Breaking: markets react as the central bank moves rates. Full story and context inside.",
    urls: [`https://${domain}/article/${Math.floor(Math.random() * 1e6)}`],
  });
}
