# Architecture

TGAutoPoster is a pnpm/TypeScript monorepo. The design goal is a **clean core**
(deterministic, testable analysis + entitlement + scheduling) with **swappable
edges** (Telegram ingestion, AI providers, persistence) so the product runs with
zero external dependencies in development and goes live by filling in `.env`.

## Data flow — the full autopilot loop

```
Telegram channel ── MTProto (GramJS user session; dev: synthetic) ──► MessageRecord[]
                                                                          │
                          ┌───────────────────────────────────────────────┤
                          ▼                                               ▼
                 @tgap/analysis (pure, tested)                 history sample (few-shot pool)
                 slots · eras · gaps · typeMix · style                    │
                          │                                               │
        AI style guide (once, editable) ◄─────────────────────────────────┘
                          │
   Sources: AI-guessed → AI-investigated → admin-reviewed (+prompt per source)
                          │
   ┌──── scheduler tick (cadence.ts: daily/weekly/monthly slots, UTC) ────┐
   │  content pipeline: fetch RSS/articles → dedup(seen) → fresh items    │
   │  generation.ts: style guide + channel's own posts + owner edit       │
   │    corrections + grounded items → draft (fast/smart model tier,      │
   │    cached style prefix) — news with no material is REFUSED           │
   │  autopilot: manual → buttons | semi → grace window | auto → publish  │
   │  publisher: sendMessage/sendPhoto to the channel (bot = admin)       │
   └──────────────────────────────────────────────────────────────────────┘
                          │
        grammY bot (confirm/edit/decline; edits feed style back)
        React Mini App (analytics · sources · schedule+autopilot ·
                        style guide editor · studio · admin+costs)
                          │
        Store — JSON-file persisted (data/store.json); Prisma schema
        remains the path to Postgres at scale
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

### `@tgap/ai` — the writing brain, cost-shaped
`TextProvider` / `ImageProvider` interfaces with Anthropic (official SDK),
OpenAI images, and deterministic **mocks** behind `createAiClient(env, onUsage)`.
- **Model tiers** — every `TextRequest` carries `tier`; routine post types map
  to the fast model (Haiku 4.5 default), long-form and one-time work to the
  smart model (Sonnet 5 default). No sampling params are sent (current models
  reject them).
- **Prompt caching** — the per-channel system prefix (style guide + examples +
  corrections) is marked `cache_control: ephemeral`; repeat generations read it
  at ~10% price.
- **Style engine (`style.ts`)** — `selectExamples` ranks the channel's own posts
  by engagement per type for few-shot imitation; `generateStyleGuide` writes an
  editable markdown guide from history; `formatCorrections` folds the owner's
  past edits into the prompt so the model learns their preferences.
- **Grounded prompts (`prompts.ts`)** — generation embeds fetched source items
  with a hard "only facts from the material, include the link" rule. Everything
  the model is told is assembled here and surfaced verbatim to admins.
- **Usage hook** — every call reports tokens/images for spend tracking.

### `@tgap/server` — API + bot + autopilot
- **`api.ts`** — Fastify routes: me/entitlement, channel connect + analysis,
  settings (autopilot), style guide (get/put/regenerate), source CRUD + AI
  investigate, slots, grounded generation, draft actions (incl. publish),
  contact, admin stats + AI spend. `initData` HMAC verified on every request.
- **`bot.ts`** — grammY bot: `/start`, `/connect`, `/generate`, `/autopilot`,
  the confirm/edit/decline/regenerate inline flow; owner edits are recorded as
  style feedback. No-ops safely without a token.
- **`generation.ts`** — the single generation path (API/bot/scheduler): gather
  grounded material → ensure style guide → few-shot + corrections → draft.
  News/digest slots **refuse to generate** without fresh material in live mode.
- **`content/`** — RSS/Atom parsing (fast-xml-parser), minimal article-text
  extraction, and the dedup pipeline (`seen` links per channel, freshness
  window, per-source caps).
- **`cadence.ts` + `scheduler.ts`** — cadence strings (`daily@09:00,18:00`,
  `weekly:1@12:00`, `monthly:1@10:00`, UTC) parsed and fired with persisted
  occurrence keys (restart-safe, never double-posts); autopilot routing
  (manual/semi/auto) and the **publisher** (sendPhoto/sendMessage to the real
  channel; data-URL images are uploaded as files).
- **`entitlement.ts`** — freemium: trial → free daily quota → Pro. Enforced in
  the API, the bot *and* the scheduler. Unit-tested.
- **`ingest/`** — `HistoryIngester`: **real GramJS MTProto adapter** (used when
  `TELEGRAM_STRING_SESSION` is set; `tg:login` script mints it interactively)
  with a synthetic fallback for keyless dev. MTProto is required because the
  Bot API cannot page back through history.
- **`store.ts`** — JSON-file-persisted state (debounced writes, loaded on
  boot): channels + settings + style guides + history samples, sources, slots,
  drafts, entitlements, seen links, edit pairs, fired occurrences, usage
  totals. `prisma/schema.prisma` is the migration path to Postgres at scale.

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

## Remaining hardening (for scale/production)

1. **Payments** — the Telegram Stars invoice + `successful_payment` handler;
   entitlement logic (`grantPro`) is ready and waiting for it.
2. **Postgres** — swap the JSON-file store for a Prisma repository (schema
   included) once concurrent load or multi-instance deployment demands it.
3. **Timezones** — cadences are UTC; per-channel timezone would improve UX.
4. **Retries/backoff** — AI and fetch calls fail soft but don't retry;
   add exponential backoff for live-mode robustness.
5. **Secrets & auth** — real `SESSION_JWT_SECRET`; never log `initData`;
   `.env`/`.session`/`data/` are gitignored already.
6. **Observability** — structured logs, error tracking, rate limiting on
   `/api/*`.
7. **Proxy environments** — Node's `fetch` ignores `HTTPS_PROXY`; if deploying
   behind a corporate proxy, wire an undici proxy agent for the content
   pipeline.
