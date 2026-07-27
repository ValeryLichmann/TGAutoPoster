import { z } from "zod";
import { ChannelAnalysis } from "./analysis.js";
import { Source, SourceInput } from "./sources.js";
import { PostDraft, SlotConfig } from "./posts.js";
import { AccessDecision, Entitlement } from "./billing.js";
import { AiUsageTotals } from "./settings.js";

/** GET /api/channels/:id/analysis */
export const AnalysisResponse = z.object({ analysis: ChannelAnalysis });
export type AnalysisResponse = z.infer<typeof AnalysisResponse>;

/** GET /api/channels/:id/sources */
export const SourcesResponse = z.object({ sources: z.array(Source) });
export type SourcesResponse = z.infer<typeof SourcesResponse>;

/** POST /api/channels/:id/sources */
export const CreateSourceRequest = SourceInput;
export type CreateSourceRequest = z.infer<typeof CreateSourceRequest>;

/** GET /api/channels/:id/slots */
export const SlotsResponse = z.object({ slots: z.array(SlotConfig) });
export type SlotsResponse = z.infer<typeof SlotsResponse>;

/** GET /api/channels/:id/drafts */
export const DraftsResponse = z.object({ drafts: z.array(PostDraft) });
export type DraftsResponse = z.infer<typeof DraftsResponse>;

/** GET /api/me */
export const MeResponse = z.object({
  userId: z.string(),
  displayName: z.string(),
  isAdmin: z.boolean(),
  entitlement: Entitlement,
  access: AccessDecision,
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Admin analytics summary. GET /api/admin/stats */
export const AdminStats = z.object({
  totalUsers: z.number().int(),
  activeChannels: z.number().int(),
  draftsGenerated: z.number().int(),
  approvalRate: z.number(),
  planBreakdown: z.record(z.string(), z.number().int()),
  postsPublished7d: z.array(z.object({ date: z.string(), count: z.number().int() })),
  usage: AiUsageTotals,
});
export type AdminStats = z.infer<typeof AdminStats>;

export const ApiError = z.object({ error: z.string(), code: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;
