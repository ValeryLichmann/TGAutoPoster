# Architecture

TGAutoPoster is a pnpm/TypeScript monorepo. The design goal is a **clean core**
(deterministic, testable analysis + entitlement) with **swappable edges**
(Telegram ingestion, AI providers, persistence) so the product runs with zero
external dependencies in development and hardens into production by filling in
`.env` and adopting Prisma.

## Data flow

```
Telegram channel
      │  MTProto (GramJS, read-only user session)  ── ingest/mtproto.ts
      ▼                                               (dev: ingest/synthetic.ts)
MessageRecord[]  ──►  @tgap/analysis  ──►  ChannelAnalysis
                       (pure, tested)        │  slots · eras · gaps · typeMix · style · topDomains
                                             ▼
                    @tgap/ai ── investigateSources() ──►  Source[]  (AI-verified, admin-reviewed)
                             ── generatePostDraft()   ──►  PostDraft (text + image + transparent prompt)
                                             │
      ┌──────────────────────────────────────┴───────────────────────────┐
      ▼                                                                    ▼
  grammY bot  (confirm/edit/decline inline)                    React Mini App  (analytics, sources,
      │  entitlement-gated                                       schedule, studio, admin, support)
      ▼                                                                    ▲
  @tgap/server  Fastify API  ◄───────────────────────────── x-init-data (verified) ┘
      │
  Store (in-memory)  ⇄  prisma/schema.prisma  (production)
```

## Packages

### `@tgap/shared`
The single source of truth for the domain, expressed as zod schemas so the same
definitions **validate API payloads on the server and type the React UI**. Key
types: `MessageRecord`, `PostType`, `ChannelAnalysis` (with `ScheduleSlot`,
`ChannelEra`, `InactivityGap`), `Source`, `PostDraft`, `SlotConfig`,
`Entitlement`, `AccessDecision`.

### `@tgap/analysis` — the intellectual core
Pure functions, no I/O, no AI. `analyzeChannel(messages, opts)` produces a
`ChannelAnalysis`:
- **`classify.ts`** — deterministic post-type heuristics (news/digest/promo/…).
- **`cadence.ts`** — per-type recurring-slot detection: periodicity from the
  median inter-post interval, times-of-day via 1-D clustering, weekday/day-of-month
  concentration, per-period counts, and a regularity-based confidence.
- **`eras.ts`** — splits the timeline at long gaps, merges neighbours with the
  same dominant type/cadence, so only genuine style shifts surface as eras.
- **`gaps.ts`** — dormant-stretch detection (the “waves”).
- **`stats.ts`** — type mix, posts/day, style profile, top cited domains.
- **`sources.ts`** — deterministic candidate sources from cited domains.

Fully unit-tested against a synthetic year with a known schedule.

### `@tgap/ai` — vendor-agnostic AI
`TextProvider` / `ImageProvider` interfaces with three implementations:
Anthropic (Messages API, fetch-based), OpenAI images, and deterministic **mocks**.
`createAiClient(env)` picks providers from `AI_MODE` + which keys exist, so the
app always runs. `prompts.ts` assembles **every** instruction the model gets, so
it can be shown verbatim to admins (transparency requirement). `generate.ts`
stores the exact prompt on each draft; `investigate.ts` turns cited domains into
verified sources.

### `@tgap/server` — API + bot + rules
- **`api.ts`** — Fastify routes: `/api/me`, channel connect/analysis, source
  CRUD + AI investigate, slot config, draft generate + actions, contact, admin
  stats. A `preHandler` verifies Telegram Mini App `initData` (HMAC) on every
  request.
- **`bot.ts`** — grammY bot: `/start` (Mini App button), `/connect`, `/generate`,
  and the **confirm/edit/decline/regenerate** inline callback flow. No-ops safely
  when `TELEGRAM_BOT_TOKEN` is unset.
- **`entitlement.ts`** — freemium: `createTrial` → `checkAccess` (trial unlimited,
  free tier daily quota with midnight reset) → `grantPro`. Unit-tested.
- **`ingest/`** — `HistoryIngester` interface; `SyntheticIngester` (dev) and the
  documented **MTProto/GramJS** adapter for production (the Bot API cannot read
  back through history — MTProto is required for “≥ 1 year”).
- **`store.ts`** — in-memory repository seeded with a demo analysed channel.
  `prisma/schema.prisma` is the production persistence model to migrate to.

### `@tgap/miniapp` — the Mini App
React + Vite. `telegram.ts` boots the WebApp SDK, adopts Telegram **theme
params**, and provides a browser fallback. `api.ts` sends `x-init-data` on every
call. Views: **Home** (hero + animated How-it-works + FAQ + connect), **Analytics**,
**Sources** (review/edit/approve/delete + add-your-own with prompt), **Schedule**
(cadence + editable style/image prompts), **Studio** (generate + confirm/edit/
decline + “see the exact prompt”), **Support** (contact + FAQ), **Admin**
(stats, plan breakdown, 7-day chart). A freemium **Upgrade** sheet (Telegram
Stars) appears on quota.

## Why these choices

- **MTProto for ingestion.** The Bot API only receives new updates; it can't page
  a channel's past. A read-only user session (GramJS) is the standard way to read
  ≥ 1 year, so ingestion is abstracted behind `HistoryIngester`.
- **Deterministic engine, probabilistic edges.** Cadence/era detection is pure
  and tested; the AI only *writes* and *investigates* on top of it. That keeps the
  product debuggable and cheap, and lets it run with no keys.
- **Transparency by construction.** Prompts are built in one place and surfaced;
  sources carry `origin` + `rationale`; drafts carry their generation prompt.

## Production hardening checklist

1. **Persistence** — replace `Store` with a Prisma repository (schema included);
   set `DATABASE_URL` to Postgres.
2. **MTProto** — add `telegram` (GramJS), generate a `StringSession`
   (`pnpm --filter @tgap/server tg:login`), return `MtprotoIngester` from
   `ingest/index.ts`.
3. **Payments** — implement the Telegram Stars invoice + `successful_payment`
   handler; call `grantPro` on success.
4. **Publishing** — a scheduler that turns `approved` drafts into real channel
   posts at their `scheduledFor` time (bot must be a channel admin).
5. **AI cost/limits** — caching, retries, and per-plan model/size selection.
6. **Secrets & auth** — real `SESSION_JWT_SECRET`, rotate tokens, never log
   `initData`; keep `.session`/`.env` out of git (already in `.gitignore`).
7. **Observability** — structured logs, error tracking, rate limiting on
   `/api/*`.
