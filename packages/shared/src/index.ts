/**
 * @tgap/shared — the domain model shared across the analysis engine, AI layer,
 * server/bot, and the Mini App front-end. Types are defined once as zod schemas
 * so the same definitions validate API payloads and type the React UI.
 */
export * from "./primitives.js";
export * from "./messages.js";
export * from "./analysis.js";
export * from "./sources.js";
export * from "./posts.js";
export * from "./billing.js";
export * from "./api.js";
