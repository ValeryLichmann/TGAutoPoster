# TGAutoPoster

**An AI posting copilot for Telegram channel owners.** Connect a channel, and
TGAutoPoster reads up to a year of history, learns its cadence, style and
sources, then drafts posts you approve with a tap — inside a native Telegram
Mini App and bot.

> Status: **runnable MVP foundation.** The analysis engine, freemium logic and
> AI layer are real and tested; the whole product boots and runs end-to-end with
> **zero API keys** (deterministic mock AI + synthetic channel history + in-memory
> store). Wire real Telegram/AI/DB in via `.env` when ready — see
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it does

- **Analyses** a channel's history: posts/day, type mix, and recurring *slots*
  (e.g. “2× daily news at 09:00 & 18:00, weekly Monday digest, monthly
  announcement”). Detects **waves** — dormant stretches and distinct *eras* when
  the style/cadence shifts.
- **Predicts a schedule** and pre-fills editable posting slots.
- **Discovers sources** with AI from the domains the channel already cites, and
  lets admins add their own with a custom prompt. Every source is visible —
  review, edit, approve, delete.
- **Generates posts** (text + AI image) and sends them to the admin with
  **confirm / edit / decline / regenerate** inline buttons.
- **Total transparency**: every generation prompt is shown; style prompts are
  editable and appendable per slot.
- **Freemium**: 3-day full-access trial, then a rate-limited free tier or Pro
  (Telegram Stars). Trial/quota/entitlement logic is real and unit-tested.
- **Admin panel**, **contact/support**, **FAQ**, and an animated **How it works**
  flow — all in a Telegram-native, theme-aware UI.

## Quick start (no keys needed)

```bash
pnpm install

# Terminal 1 — API + bot (bot disabled until a token is set)
AI_MODE=mock pnpm dev:server        # http://localhost:8787

# Terminal 2 — Mini App
pnpm dev:miniapp                    # http://localhost:5173  (proxies /api → 8787)
```

Open http://localhost:5173 in a browser (a demo user is used outside Telegram).
A demo channel is pre-analysed on boot so every screen has data. Add `?uid=42`
to the URL to act as a different user.

### Enable the real thing

Copy `.env.example` → `.env` and fill in what you need:

| Capability | Env |
|---|---|
| Bot + Mini App button + inline flow | `TELEGRAM_BOT_TOKEN`, `MINIAPP_URL` |
| Read ≥ 1yr channel history (MTProto) | `TELEGRAM_API_ID/HASH`, `TELEGRAM_STRING_SESSION` (see `packages/server/src/ingest/mtproto.ts`) |
| AI text (analysis, writing, sources) | `ANTHROPIC_API_KEY` |
| AI images | `OPENAI_API_KEY` |
| Admin panel access | `ADMIN_USER_IDS` |
| Persistence | `DATABASE_URL` (+ adopt `prisma/schema.prisma`) |

With no AI keys the app runs in **mock mode**; set keys and it switches to live
automatically (`AI_MODE=auto`).

## Monorepo layout

```
packages/
  shared/     Domain model — zod schemas shared by every package
  analysis/   ★ Deterministic history-analysis engine (cadence, eras, sources) + tests
  ai/         Vendor-agnostic AI layer (Anthropic text, OpenAI images, mock fallback)
  server/     Fastify API + grammY bot + freemium entitlement + ingestion + Prisma schema
  miniapp/    React + Vite Telegram Mini App (Telegram-native, theme-aware UI)
```

## Commands

```bash
pnpm test          # all unit tests (analysis, ai, entitlement)
pnpm typecheck     # all packages
pnpm build         # build every package
```

## Tests

- `@tgap/analysis` — feeds a **known** synthetic year (2× daily news, weekly
  Monday digest, monthly announcement, a dormant stretch) and asserts the engine
  recovers the slots, gaps and eras.
- `@tgap/ai` — mock generation produces a transparent, image-bearing draft.
- `@tgap/server` — freemium trial → free-tier quota → reset → Pro.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, data flow, and
the production hardening checklist.
