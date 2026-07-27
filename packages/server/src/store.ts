import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AiUsageTotals,
  ChannelAnalysis,
  ChannelSettings,
  Entitlement,
  MessageRecord,
  PostDraft,
  ScheduleSlot,
  SlotConfig,
  Source,
} from "@tgap/shared";
import { analyzeChannel, candidateSources, annotate } from "@tgap/analysis";
import { defaultStylePrompt, type EditPair } from "@tgap/ai";
import { createTrial } from "./entitlement.js";
import { createIngester } from "./ingest/index.js";
import { config } from "./config.js";

export interface User {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

export interface Channel {
  id: string;
  title: string;
  ownerId: string;
  analysis: ChannelAnalysis;
  settings: ChannelSettings;
  /** AI-generated, admin-editable style guide. Empty until generated. */
  styleGuide: string;
  /** Recent history sample kept for few-shot examples (capped). */
  historySample: MessageRecord[];
}

export interface ContactMessage {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  answered: boolean;
}

const HISTORY_SAMPLE_CAP = 250;
const SEEN_CAP = 600;
const FIRED_CAP = 1000;

/**
 * Data layer with JSON-file persistence: state loads on boot and every mutation
 * schedules a debounced save, so drafts/sources/entitlements survive restarts
 * with zero external services. The Prisma schema remains the path to a real
 * database at scale.
 */
export class Store {
  users = new Map<string, User>();
  entitlements = new Map<string, Entitlement>();
  channels = new Map<string, Channel>();
  sources = new Map<string, Source[]>();
  slots = new Map<string, SlotConfig[]>();
  drafts = new Map<string, PostDraft[]>();
  contact: ContactMessage[] = [];
  /** Per-channel links already used for drafts (grounding dedup). */
  seen = new Map<string, Set<string>>();
  /** Per-channel admin edit pairs (style feedback). */
  edits = new Map<string, EditPair[]>();
  /** Occurrence keys of slot firings already handled (restart-safe). */
  firedKeys = new Set<string>();
  usage: AiUsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, images: 0, estCostUsd: 0 };

  private ingester = createIngester({ stringSession: config.stringSession });
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filePath?: string) {
    if (filePath && existsSync(filePath)) this.load(filePath);
  }

  // ── persistence ────────────────────────────────────────────────

  persist() {
    if (!this.filePath) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    if (!this.filePath) return;
    const data = {
      users: [...this.users.values()],
      entitlements: [...this.entitlements.values()],
      channels: [...this.channels.values()],
      sources: [...this.sources.entries()],
      slots: [...this.slots.entries()],
      drafts: [...this.drafts.entries()],
      contact: this.contact,
      seen: [...this.seen.entries()].map(([k, v]) => [k, [...v]]),
      edits: [...this.edits.entries()],
      firedKeys: [...this.firedKeys],
      usage: this.usage,
    };
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data));
  }

  private load(path: string) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as ReturnType<Store["snapshotForLoad"]>;
      for (const u of raw.users ?? []) this.users.set(u.id, u);
      for (const e of raw.entitlements ?? []) this.entitlements.set(e.userId, e);
      for (const c of raw.channels ?? []) this.channels.set(c.id, c);
      this.sources = new Map(raw.sources ?? []);
      this.slots = new Map(raw.slots ?? []);
      this.drafts = new Map(raw.drafts ?? []);
      this.contact = raw.contact ?? [];
      this.seen = new Map((raw.seen ?? []).map(([k, v]: [string, string[]]) => [k, new Set(v)]));
      this.edits = new Map(raw.edits ?? []);
      this.firedKeys = new Set(raw.firedKeys ?? []);
      if (raw.usage) this.usage = raw.usage;
      console.log(`▶ Loaded state from ${path} (${this.channels.size} channel(s), ${this.users.size} user(s))`);
    } catch (err) {
      console.error(`⚠ Failed to load ${path} — starting fresh:`, err);
    }
  }

  // typing helper for load()
  private snapshotForLoad() {
    return {
      users: [] as User[],
      entitlements: [] as Entitlement[],
      channels: [] as Channel[],
      sources: [] as [string, Source[]][],
      slots: [] as [string, SlotConfig[]][],
      drafts: [] as [string, PostDraft[]][],
      contact: [] as ContactMessage[],
      seen: [] as [string, string[]][],
      edits: [] as [string, EditPair[]][],
      firedKeys: [] as string[],
      usage: undefined as AiUsageTotals | undefined,
    };
  }

  // ── domain operations ──────────────────────────────────────────

  ensureUser(id: string, displayName: string): User {
    let u = this.users.get(id);
    if (!u) {
      u = { id, displayName, isAdmin: config.adminUserIds.includes(id) };
      this.users.set(id, u);
      this.persist();
    }
    return u;
  }

  ensureEntitlement(userId: string): Entitlement {
    let e = this.entitlements.get(userId);
    if (!e) {
      e = createTrial(userId, {
        trialDays: config.freeTrialDays,
        freeDailyLimit: config.freeTierDailyPosts,
      });
      this.entitlements.set(userId, e);
      this.persist();
    }
    return e;
  }

  setEntitlement(e: Entitlement) {
    this.entitlements.set(e.userId, e);
    this.persist();
  }

  addUsage(u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; images: number; costUsd: number }) {
    this.usage.inputTokens += u.inputTokens;
    this.usage.outputTokens += u.outputTokens;
    this.usage.cacheReadTokens += u.cacheReadTokens;
    this.usage.images += u.images;
    this.usage.estCostUsd = Number((this.usage.estCostUsd + u.costUsd).toFixed(4));
    this.persist();
  }

  seenFor(channelId: string): Set<string> {
    let s = this.seen.get(channelId);
    if (!s) {
      s = new Set();
      this.seen.set(channelId, s);
    }
    // Cap: drop oldest entries when oversized.
    if (s.size > SEEN_CAP) {
      const keep = [...s].slice(-Math.floor(SEEN_CAP * 0.8));
      s.clear();
      for (const k of keep) s.add(k);
    }
    return s;
  }

  recordEdit(channelId: string, pair: EditPair) {
    const list = this.edits.get(channelId) ?? [];
    list.push(pair);
    this.edits.set(channelId, list.slice(-10));
    this.persist();
  }

  markFired(key: string) {
    this.firedKeys.add(key);
    if (this.firedKeys.size > FIRED_CAP) {
      this.firedKeys = new Set([...this.firedKeys].slice(-Math.floor(FIRED_CAP * 0.8)));
    }
    this.persist();
  }

  /** Connect a channel: ingest history, analyse, seed sources + slot configs. */
  async connectChannel(handle: string, ownerId: string): Promise<Channel> {
    const { channelId, title } = await this.ingester.resolveChannel(handle);
    const messages = await this.ingester.fetchHistory(channelId);
    const analysis = analyzeChannel(messages, { channelId, channelTitle: title });

    const channel: Channel = {
      id: channelId,
      title,
      ownerId,
      analysis,
      settings: { autopilot: "manual" },
      styleGuide: "",
      historySample: messages.slice(-HISTORY_SAMPLE_CAP),
    };
    this.channels.set(channelId, channel);
    this.sources.set(channelId, candidateSources(channelId, annotate(messages)));
    this.slots.set(channelId, analysis.slots.map((s) => this.slotToConfig(channelId, analysis, s)));
    this.drafts.set(channelId, this.drafts.get(channelId) ?? []);
    this.persist();
    return channel;
  }

  private slotToConfig(channelId: string, analysis: ChannelAnalysis, slot: ScheduleSlot): SlotConfig {
    const cadence =
      slot.periodicity === "daily"
        ? `daily@${slot.timesOfDay.join(",") || "09:00"}`
        : slot.periodicity === "weekly" || slot.periodicity === "biweekly"
          ? `weekly:${slot.weekdays.join(",") || "1"}@${slot.timesOfDay.join(",") || "12:00"}`
          : slot.periodicity === "monthly"
            ? `monthly:${slot.dayOfMonth ?? 1}@${slot.timesOfDay.join(",") || "10:00"}`
            : "irregular";
    return {
      slotId: slot.id,
      channelId,
      enabled: true,
      postType: slot.postType,
      cadence,
      stylePrompt: defaultStylePrompt(analysis, slot),
      withImage: slot.postType !== "poll",
      imageStylePrompt: "clean, modern editorial illustration, subtle tech aesthetic",
      sourceIds: [],
    };
  }

  channelsOf(ownerId: string): Channel[] {
    return [...this.channels.values()].filter((c) => c.ownerId === ownerId);
  }

  findDraft(id: string): { channelId: string; draft: PostDraft } | null {
    for (const [channelId, list] of this.drafts) {
      const draft = list.find((d) => d.id === id);
      if (draft) return { channelId, draft };
    }
    return null;
  }
}

/** Build the store: load persisted state if present, else seed a demo channel. */
export async function createSeededStore(): Promise<Store> {
  const store = new Store(config.dataFile);
  if (store.channels.size === 0) {
    const demoId = config.adminUserIds[0] ?? "1";
    const admin = store.ensureUser(demoId, "Demo Admin");
    admin.isAdmin = true;
    store.ensureEntitlement(demoId);
    await store.connectChannel("@demo_news", demoId);
  }
  return store;
}
