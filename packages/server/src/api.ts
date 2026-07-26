import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import type { AdminStats, PostDraft, Source } from "@tgap/shared";
import { createAiClient, generatePostDraft, investigateSources } from "@tgap/ai";
import { config } from "./config.js";
import { verifyInitData, type TgUser } from "./auth.js";
import { checkAccess, recordUsage } from "./entitlement.js";
import type { Store } from "./store.js";

const ai = createAiClient(config.ai);
const policy = { trialDays: config.freeTrialDays, freeDailyLimit: config.freeTierDailyPosts };

/** Pull the authenticated Telegram user off the request (set by preHandler). */
function currentUser(req: FastifyRequest): TgUser {
  const u = (req as FastifyRequest & { tgUser?: TgUser }).tgUser;
  if (!u) throw Object.assign(new Error("unauthenticated"), { statusCode: 401 });
  return u;
}

function findSource(store: Store, id: string): { channelId: string; source: Source } | null {
  for (const [channelId, list] of store.sources) {
    const source = list.find((s) => s.id === id);
    if (source) return { channelId, source };
  }
  return null;
}

function findDraft(store: Store, id: string): { channelId: string; draft: PostDraft } | null {
  for (const [channelId, list] of store.drafts) {
    const draft = list.find((d) => d.id === id);
    if (draft) return { channelId, draft };
  }
  return null;
}

export async function buildApi(store: Store): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.nodeEnv === "production" ? "info" : "warn" } });
  await app.register(cors, { origin: true });

  // --- Auth: verify Telegram Mini App initData on every /api route ---
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/") || req.url === "/api/health") return;
    const initData = (req.headers["x-init-data"] as string) ?? "";
    const user = verifyInitData(initData);
    if (!user) return reply.code(401).send({ error: "Invalid Telegram auth", code: "AUTH" });
    store.ensureUser(user.id, user.displayName);
    store.ensureEntitlement(user.id);
    (req as FastifyRequest & { tgUser?: TgUser }).tgUser = user;
  });

  const requireAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!config.adminUserIds.includes(currentUser(req).id)) {
      reply.code(403).send({ error: "Admin only", code: "FORBIDDEN" });
      return false;
    }
    return true;
  };

  app.get("/api/health", async () => ({ ok: true, ai: ai.mock ? "mock" : "live" }));

  // --- Me / entitlement ---
  app.get("/api/me", async (req) => {
    const u = currentUser(req);
    const ent = store.ensureEntitlement(u.id);
    const user = store.ensureUser(u.id, u.displayName);
    return {
      userId: u.id,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      entitlement: ent,
      access: checkAccess(ent, policy),
    };
  });

  // --- Channels ---
  app.get("/api/channels", async (req) => {
    const u = currentUser(req);
    return {
      channels: store.channelsOf(u.id).map((c) => ({
        id: c.id,
        title: c.title,
        posts: c.analysis.window.totalPosts,
        avgPerDay: c.analysis.avgPostsPerDay,
        slots: c.analysis.slots.length,
      })),
    };
  });

  app.post("/api/channels/connect", async (req, reply) => {
    const u = currentUser(req);
    const body = req.body as { handle?: string };
    if (!body?.handle) return reply.code(400).send({ error: "handle required" });
    const channel = await store.connectChannel(body.handle, u.id);
    // Enrich sources with AI investigation in the background (best-effort).
    void investigateSources(ai, channel.analysis)
      .then((found) => {
        if (found.length) store.sources.set(channel.id, [...(store.sources.get(channel.id) ?? []), ...found]);
      })
      .catch(() => {});
    return { channel: { id: channel.id, title: channel.title }, analysis: channel.analysis };
  });

  app.get("/api/channels/:id/analysis", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    return { analysis: channel.analysis };
  });

  // --- Sources (transparent, reviewable) ---
  app.get("/api/channels/:id/sources", async (req) => {
    const id = (req.params as { id: string }).id;
    return { sources: store.sources.get(id) ?? [] };
  });

  app.post("/api/channels/:id/sources", async (req) => {
    const id = (req.params as { id: string }).id;
    const b = req.body as Partial<Source>;
    const source: Source = {
      id: `src_user_${Date.now()}`,
      channelId: id,
      kind: (b.kind as Source["kind"]) ?? "website",
      title: b.title ?? b.url ?? "source",
      url: b.url ?? "",
      origin: "user_added",
      approved: true,
      prompt: b.prompt ?? "",
      rationale: "Added by admin.",
      confidence: 1,
      createdAt: new Date().toISOString(),
    };
    const list = store.sources.get(id) ?? [];
    list.push(source);
    store.sources.set(id, list);
    return { source };
  });

  app.patch("/api/sources/:id", async (req, reply) => {
    const hit = findSource(store, (req.params as { id: string }).id);
    if (!hit) return reply.code(404).send({ error: "source not found" });
    const b = req.body as Partial<Source>;
    Object.assign(hit.source, {
      approved: b.approved ?? hit.source.approved,
      prompt: b.prompt ?? hit.source.prompt,
      title: b.title ?? hit.source.title,
      url: b.url ?? hit.source.url,
    });
    return { source: hit.source };
  });

  app.delete("/api/sources/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hit = findSource(store, id);
    if (!hit) return reply.code(404).send({ error: "source not found" });
    store.sources.set(
      hit.channelId,
      (store.sources.get(hit.channelId) ?? []).filter((s) => s.id !== id),
    );
    return { ok: true };
  });

  app.post("/api/channels/:id/sources/investigate", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    const found = await investigateSources(ai, channel.analysis);
    const list = store.sources.get(channel.id) ?? [];
    store.sources.set(channel.id, [...list, ...found]);
    return { sources: found };
  });

  // --- Slots (schedule + editable prompts) ---
  app.get("/api/channels/:id/slots", async (req) => {
    const id = (req.params as { id: string }).id;
    return { slots: store.slots.get(id) ?? [] };
  });

  app.patch("/api/slots/:id", async (req, reply) => {
    const slotId = (req.params as { id: string }).id;
    for (const [, list] of store.slots) {
      const slot = list.find((s) => s.slotId === slotId);
      if (slot) {
        Object.assign(slot, req.body as object);
        return { slot };
      }
    }
    return reply.code(404).send({ error: "slot not found" });
  });

  // --- Drafts + generation (entitlement-gated) ---
  app.get("/api/channels/:id/drafts", async (req) => {
    const id = (req.params as { id: string }).id;
    return { drafts: store.drafts.get(id) ?? [] };
  });

  app.post("/api/channels/:id/generate", async (req, reply) => {
    const u = currentUser(req);
    const channelId = (req.params as { id: string }).id;
    const channel = store.channels.get(channelId);
    if (!channel) return reply.code(404).send({ error: "channel not found" });

    const ent = store.ensureEntitlement(u.id);
    const access = checkAccess(ent, policy);
    if (!access.allowed) return reply.code(402).send({ error: access.reason, code: "QUOTA", access });

    const body = req.body as { slotId?: string; topic?: string };
    const slots = store.slots.get(channelId) ?? [];
    const slot = slots.find((s) => s.slotId === body.slotId) ?? slots[0];
    if (!slot) return reply.code(400).send({ error: "no slot configured" });

    const draft = await generatePostDraft(ai, {
      channelId,
      slot,
      sources: store.sources.get(channelId) ?? [],
      topic: body.topic ?? channel.analysis.typeMix[0]?.type ?? "today's top story",
    });
    (store.drafts.get(channelId) ?? store.drafts.set(channelId, []).get(channelId)!).push(draft);
    store.setEntitlement(recordUsage(ent));
    return { draft };
  });

  app.post("/api/drafts/:id/action", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hit = findDraft(store, id);
    if (!hit) return reply.code(404).send({ error: "draft not found" });
    const b = req.body as { action?: string; text?: string; scheduledFor?: string };
    const now = new Date().toISOString();
    switch (b.action) {
      case "approve":
        hit.draft.status = "approved";
        break;
      case "decline":
        hit.draft.status = "declined";
        break;
      case "edit":
        hit.draft.text = b.text ?? hit.draft.text;
        hit.draft.status = "edited";
        break;
      case "reschedule":
        hit.draft.scheduledFor = b.scheduledFor ?? hit.draft.scheduledFor;
        break;
      default:
        return reply.code(400).send({ error: "unknown action" });
    }
    hit.draft.updatedAt = now;
    return { draft: hit.draft };
  });

  // --- Contact / support ---
  app.post("/api/contact", async (req) => {
    const u = currentUser(req);
    const b = req.body as { text?: string };
    const msg = {
      id: `msg_${Date.now()}`,
      userId: u.id,
      text: b.text ?? "",
      createdAt: new Date().toISOString(),
      answered: false,
    };
    store.contact.push(msg);
    return { ok: true, message: msg };
  });

  // --- Admin analytics ---
  app.get("/api/admin/stats", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return computeAdminStats(store);
  });

  app.get("/api/admin/contact", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { messages: store.contact };
  });

  return app;
}

function computeAdminStats(store: Store): AdminStats {
  const allDrafts = [...store.drafts.values()].flat();
  const approved = allDrafts.filter((d) => ["approved", "edited", "published"].includes(d.status));
  const planBreakdown: Record<string, number> = {};
  for (const e of store.entitlements.values()) planBreakdown[e.plan] = (planBreakdown[e.plan] ?? 0) + 1;

  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: key,
      count: allDrafts.filter((x) => x.status === "published" && x.updatedAt.startsWith(key)).length,
    });
  }

  return {
    totalUsers: store.users.size,
    activeChannels: store.channels.size,
    draftsGenerated: allDrafts.length,
    approvalRate: allDrafts.length ? Number((approved.length / allDrafts.length).toFixed(2)) : 0,
    planBreakdown,
    postsPublished7d: days,
  };
}
