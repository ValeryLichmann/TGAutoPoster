import type {
  AdminStats,
  ChannelAnalysis,
  MeResponse,
  PostDraft,
  SlotConfig,
  Source,
} from "@tgap/shared";
import { initData } from "./telegram.js";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-init-data": initData(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error ?? "Request failed"), { status: res.status, body });
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<MeResponse>("/api/me"),
  channels: () =>
    req<{ channels: { id: string; title: string; posts: number; avgPerDay: number; slots: number }[] }>(
      "/api/channels",
    ),
  connect: (handle: string) =>
    req<{ channel: { id: string; title: string }; analysis: ChannelAnalysis }>(
      "/api/channels/connect",
      { method: "POST", body: JSON.stringify({ handle }) },
    ),
  analysis: (id: string) => req<{ analysis: ChannelAnalysis }>(`/api/channels/${id}/analysis`),

  sources: (id: string) => req<{ sources: Source[] }>(`/api/channels/${id}/sources`),
  addSource: (id: string, body: Partial<Source>) =>
    req<{ source: Source }>(`/api/channels/${id}/sources`, { method: "POST", body: JSON.stringify(body) }),
  updateSource: (sid: string, body: Partial<Source>) =>
    req<{ source: Source }>(`/api/sources/${sid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSource: (sid: string) => req<{ ok: boolean }>(`/api/sources/${sid}`, { method: "DELETE" }),
  investigate: (id: string) =>
    req<{ sources: Source[] }>(`/api/channels/${id}/sources/investigate`, { method: "POST" }),

  slots: (id: string) => req<{ slots: SlotConfig[] }>(`/api/channels/${id}/slots`),
  updateSlot: (sid: string, body: Partial<SlotConfig>) =>
    req<{ slot: SlotConfig }>(`/api/slots/${sid}`, { method: "PATCH", body: JSON.stringify(body) }),

  drafts: (id: string) => req<{ drafts: PostDraft[] }>(`/api/channels/${id}/drafts`),
  generate: (id: string, body: { slotId?: string; topic?: string }) =>
    req<{ draft: PostDraft }>(`/api/channels/${id}/generate`, { method: "POST", body: JSON.stringify(body) }),
  draftAction: (did: string, body: { action: string; text?: string; scheduledFor?: string }) =>
    req<{ draft: PostDraft }>(`/api/drafts/${did}/action`, { method: "POST", body: JSON.stringify(body) }),

  contact: (text: string) =>
    req<{ ok: boolean }>("/api/contact", { method: "POST", body: JSON.stringify({ text }) }),
  adminStats: () => req<AdminStats>("/api/admin/stats"),
};
