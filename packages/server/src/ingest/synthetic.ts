import type { MediaKind, MessageRecord } from "@tgap/shared";

interface SynthInput {
  date: Date;
  text?: string;
  media?: MediaKind;
  urls?: string[];
  hashtags?: string[];
  hasPoll?: boolean;
  isForward?: boolean;
  forwardFrom?: string | null;
}

/**
 * Generate a realistic year of channel history for demos/tests without touching
 * Telegram. Mirrors a common pattern: 2× daily news with links, a weekly Monday
 * digest, monthly announcements, plus a dormant summer stretch that resumes in a
 * slightly different style. The real analysis engine runs on this unchanged.
 */
export function syntheticHistory(channelId: string, base = new Date("2024-06-01T00:00:00Z")): MessageRecord[] {
  const out: MessageRecord[] = [];
  let id = 1;
  const domains = ["reuters.com", "bloomberg.com", "techcrunch.com", "theverge.com"];

  const push = (m: SynthInput) => {
    out.push({
      id: id++,
      channelId,
      date: m.date.toISOString(),
      text: m.text ?? "",
      media: m.media ?? "none",
      groupedId: null,
      views: 800 + Math.floor(Math.random() * 4000),
      forwards: Math.floor(Math.random() * 40),
      reactions: Math.floor(Math.random() * 200),
      urls: m.urls ?? [],
      hashtags: m.hashtags ?? [],
      hasPoll: m.hasPoll ?? false,
      isForward: m.isForward ?? false,
      forwardFrom: m.forwardFrom ?? null,
    });
  };

  const at = (day: number, h: number, min = 0) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + day);
    d.setUTCHours(h, min, 0, 0);
    return d;
  };

  for (let day = 0; day < 365; day++) {
    // Dormant stretch (days 120–210): channel goes quiet, then returns.
    const dormant = day >= 120 && day < 210;
    if (dormant) continue;

    const newStyle = day >= 210; // punchier, more emoji after the break
    const dom = domains[day % domains.length]!;

    push({
      date: at(day, 9, Math.floor(Math.random() * 8)),
      text: newStyle
        ? `🚨 ${headline(day)} — here's what it means. Full context ⤵️`
        : `${headline(day)}. Read the full report and analysis inside.`,
      urls: [`https://${dom}/story/${day}`],
    });
    push({
      date: at(day, 18, Math.floor(Math.random() * 8)),
      text: newStyle ? `📊 Evening brief: ${headline(day + 1)}` : `Evening update: ${headline(day + 1)}.`,
      urls: [`https://${domains[(day + 1) % domains.length]}/story/${day}b`],
    });

    if (at(day, 12).getUTCDay() === 1) {
      push({
        date: at(day, 12),
        text: `Weekly digest:\n1. ${headline(day)}\n2. ${headline(day + 2)}\n3. ${headline(
          day + 4,
        )}\n4. ${headline(day + 6)}`,
      });
    }
    if (at(day, 10).getUTCDate() === 1) {
      push({
        date: at(day, 10),
        text: "Announcement: we are introducing a new format and partner sources this month. Stay tuned!",
      });
    }
  }
  return out;
}

const HEADLINES = [
  "Central bank holds rates steady",
  "Major chipmaker unveils new architecture",
  "Markets rally on earnings beat",
  "Regulators open probe into big tech",
  "Startup raises record Series B",
  "New AI model tops benchmarks",
  "Energy prices ease as supply recovers",
  "Cyberattack disrupts key services",
];
function headline(seed: number): string {
  return HEADLINES[Math.abs(seed) % HEADLINES.length]!;
}
