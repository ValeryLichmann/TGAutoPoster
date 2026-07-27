import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import type { AdminStats, AutopilotMode, PostDraft, Source } from "@tgap/shared";
import { generateStyleGuide, investigateSources } from "@tgap/ai";
import { config } from "./config.js";
import { verifyInitData, type TgUser } from "./auth.js";
import { checkAccess, recordUsage } from "./entitlement.js";
import { generateForSlot, getAi } from "./generation.js";
import type { Store } from "./store.js";

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

export async function buildApi(store: Store): Promise<FastifyInstance> {
  const ai = getAi(store);
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
    const u = currentUser(req);
    const record = store.users.get(u.id);
    if (!record?.isAdmin && !config.adminUserIds.includes(u.id)) {
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
        autopilot: c.settings.autopilot,
      })),
    };
  });

  app.post("/api/channels/connect", async (req, reply) => {
    const u = currentUser(req);
    const body = req.body as { handle?: string };
    if (!body?.handle) return reply.code(400).send({ error: "handle required" });
    const channel = await store.connectChannel(body.handle, u.id);
    // Enrich in the background: AI-investigated sources + the style guide.
    void investigateSources(ai, channel.analysis)
      .then((found) => {
        if (found.length) {
          store.sources.set(channel.id, [...(store.sources.get(channel.id) ?? []), ...found]);
          store.persist();
        }
      })
      .catch(() => {});
    void generateStyleGuide(ai, channel.analysis, channel.historySample)
      .then((guide) => {
        if (!channel.styleGuide) {
          channel.styleGuide = guide;
          store.persist();
        }
      })
      .catch(() => {});
    return { channel: { id: channel.id, title: channel.title }, analysis: channel.analysis };
  });

  app.get("/api/channels/:id/analysis", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    return { analysis: channel.analysis };
  });

  // --- Channel settings (autopilot) ---
  app.get("/api/channels/:id/settings", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    return { settings: channel.settings };
  });

  app.patch("/api/channels/:id/settings", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    const b = req.body as { autopilot?: AutopilotMode };
    if (b.autopilot && ["manual", "semi", "auto"].includes(b.autopilot)) {
      channel.settings.autopilot = b.autopilot;
      store.persist();
    }
    return { settings: channel.settings };
  });

  // --- Style guide (transparent, editable) ---
  app.get("/api/channels/:id/styleguide", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    return { styleGuide: channel.styleGuide };
  });

  app.put("/api/channels/:id/styleguide", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    channel.styleGuide = (req.body as { styleGuide?: string }).styleGuide ?? "";
    store.persist();
    return { styleGuide: channel.styleGuide };
  });

  app.post("/api/channels/:id/styleguide/regenerate", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    channel.styleGuide = await generateStyleGuide(ai, channel.analysis, channel.historySample);
    store.persist();
    return { styleGuide: channel.styleGuide };
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
    store.persist();
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
      kind: b.kind ?? hit.source.kind,
    });
    store.persist();
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
    store.persist();
    return { ok: true };
  });

  app.post("/api/channels/:id/sources/investigate", async (req, reply) => {
    const channel = store.channels.get((req.params as { id: string }).id);
    if (!channel) return reply.code(404).send({ error: "channel not found" });
    const found = await investigateSources(ai, channel.analysis);
    const list = store.sources.get(channel.id) ?? [];
    store.sources.set(channel.id, [...list, ...found]);
    store.persist();
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
        store.persist();
        return { slot };
      }
    }
    return reply.code(404).send({ error: "slot not found" });
  });

  // --- Drafts + generation (entitlement-gated, grounded) ---
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

    const result = await generateForSlot(store, channel, slot, body.topic || undefined);
    if (!result.ok) return reply.code(409).send({ error: result.reason, code: "NO_MATERIAL" });
    store.setEntitlement(recordUsage(ent));
    return { draft: result.draft };
  });

  app.post("/api/drafts/:id/action", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hit = store.findDraft(id);
    if (!hit) return reply.code(404).send({ error: "draft not found" });
    const b = req.body as { action?: string; text?: string; scheduledFor?: string };
    const now = new Date().toISOString();
    switch (b.action) {
      case "approve":
        hit.draft.status = "approved";
        if (!hit.draft.scheduledFor) hit.draft.scheduledFor = now; // publish next tick
        break;
      case "decline":
        hit.draft.status = "declined";
        break;
      case "edit":
        if (b.text && b.text !== hit.draft.text) {
          store.recordEdit(hit.channelId, { before: hit.draft.text, after: b.text });
          hit.draft.text = b.text;
        }
        hit.draft.status = "edited";
        break;
      case "publish":
        // publish now: mark approved (if pending) and due immediately
        if (hit.draft.status === "pending" || hit.draft.status === "declined") {
          hit.draft.status = "approved";
        }
        hit.draft.scheduledFor = now;
        break;
      case "reschedule":
        hit.draft.scheduledFor = b.scheduledFor ?? hit.draft.scheduledFor;
        break;
      default:
        return reply.code(400).send({ error: "unknown action" });
    }
    hit.draft.updatedAt = now;
    store.persist();
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
    store.persist();
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
    usage: store.usage,
  };
}
