import type {
  ChannelAnalysis,
  Entitlement,
  PostDraft,
  ScheduleSlot,
  SlotConfig,
  Source,
} from "@tgap/shared";
import { analyzeChannel, candidateSources, annotate } from "@tgap/analysis";
import { defaultStylePrompt } from "@tgap/ai";
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
}

export interface ContactMessage {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  answered: boolean;
}

/**
 * Simple in-memory data layer so the whole product runs with no database. The
 * production schema lives in prisma/schema.prisma; swapping this class for a
 * Prisma-backed repository is the intended migration path.
 */
export class Store {
  users = new Map<string, User>();
  entitlements = new Map<string, Entitlement>();
  channels = new Map<string, Channel>();
  sources = new Map<string, Source[]>();
  slots = new Map<string, SlotConfig[]>();
  drafts = new Map<string, PostDraft[]>();
  contact: ContactMessage[] = [];

  private ingester = createIngester({ stringSession: config.stringSession });

  ensureUser(id: string, displayName: string): User {
    let u = this.users.get(id);
    if (!u) {
      u = { id, displayName, isAdmin: config.adminUserIds.includes(id) };
      this.users.set(id, u);
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
    }
    return e;
  }

  setEntitlement(e: Entitlement) {
    this.entitlements.set(e.userId, e);
  }

  /** Connect a channel: ingest history, analyse, seed sources + slot configs. */
  async connectChannel(handle: string, ownerId: string): Promise<Channel> {
    const { channelId, title } = await this.ingester.resolveChannel(handle);
    const messages = await this.ingester.fetchHistory(channelId);
    const analysis = analyzeChannel(messages, { channelId, channelTitle: title });

    const channel: Channel = { id: channelId, title, ownerId, analysis };
    this.channels.set(channelId, channel);
    this.sources.set(channelId, candidateSources(channelId, annotate(messages)));
    this.slots.set(channelId, analysis.slots.map((s) => this.slotToConfig(channelId, analysis, s)));
    this.drafts.set(channelId, []);
    return channel;
  }

  private slotToConfig(channelId: string, analysis: ChannelAnalysis, slot: ScheduleSlot): SlotConfig {
    const cadence =
      slot.periodicity === "daily"
        ? `daily@${slot.timesOfDay.join(",") || "09:00"}`
        : slot.periodicity === "weekly"
          ? `weekly:${slot.weekdays.join(",")}@${slot.timesOfDay.join(",") || "12:00"}`
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
}

/** Build a store pre-seeded with a demo admin user and an analysed channel. */
export async function createSeededStore(): Promise<Store> {
  const store = new Store();
  const demoId = config.adminUserIds[0] ?? "1";
  const admin = store.ensureUser(demoId, "Demo Admin");
  admin.isAdmin = true;
  store.ensureEntitlement(demoId);
  await store.connectChannel("@demo_news", demoId);
  return store;
}
