# TGAutoPoster

**An AI posting copilot for Telegram channel owners — up to full autopilot.**
Connect a channel and TGAutoPoster reads up to a year of history, learns its
cadence and voice, discovers its sources, then writes posts **grounded in real
fetched content** — for you to approve with a tap, or to publish entirely on its
own.

> Runs end-to-end **with zero API keys** (mock AI + synthetic history) so you
> can click through everything first; add keys/tokens in `.env` to go live.

## The full flow

1. **Connect** — `/connect @channel` (bot) or the Mini App. History is ingested
   (MTProto via GramJS when configured; synthetic demo data otherwise) and
   analysed: posts/day, type mix, recurring slots, dormant "waves", eras, style.
2. **Learn the voice** — an AI **style guide** is written from the channel's own
   posts (editable in the app), and every draft also gets the channel's real
   posts as few-shot examples. When you edit a draft, the edit is remembered and
   fed back into future generations.
3. **Ground in real sources** — AI investigates the domains the channel cites,
   proposes sources (RSS preferred); you review/approve/add your own with custom
   prompts. At generation time fresh items are **fetched, deduplicated and
   passed to the model — news posts are refused rather than invented** when no
   fresh material exists.
4. **Autopilot** — the scheduler fires each slot at its cadence and routes by
   the channel's mode:
   - **manual** — draft + confirm/edit/decline buttons in your chat
   - **semi** — auto-publishes after a grace window unless you decline
   - **auto** — publishes at slot times. *This is the "fully replaces the admin" mode.*
5. **Publish** — real `sendMessage`/`sendPhoto` to the channel (make the bot a
   channel admin). Every approval/publish respects the freemium quota.

## Cost design

- **Two model tiers**: routine posts → fast model (default Haiku 4.5, $1/$5 per
  MTok); digests/analysis/style guides/source investigation → smart model
  (default Sonnet 5, $3/$15). Both configurable via env.
- **Prompt caching**: the per-channel style guide + examples are sent as a
  cacheable prefix — repeat generations pay ~10% for it.
- **One-time work stays one-time**: the style guide is generated once and
  reused; article extraction runs only for the lead item of each draft.
- **Usage tracking**: every call's tokens/images are metered; the admin panel
  shows totals and an estimated USD cost.

## Quick start (no keys)

```bash
pnpm install
pnpm dev:server        # API + scheduler on :8787 (mock AI, demo channel seeded)
pnpm dev:miniapp       # Mini App on :5173 (proxies /api)
```

Open http://localhost:5173. State persists to `packages/server/data/store.json`.

### Going live

| Capability | What to set |
|---|---|
| Bot, inline flow, **publishing** | `TELEGRAM_BOT_TOKEN`; add the bot as channel admin |
| Mini App inside Telegram | `MINIAPP_URL` (https — e.g. an ngrok tunnel in dev) |
| Real ≥1yr history | `TELEGRAM_API_ID/HASH`, then `pnpm --filter @tgap/server tg:login` → `TELEGRAM_STRING_SESSION` |
| AI text (Claude) | `ANTHROPIC_API_KEY` |
| AI images (OpenAI) | `OPENAI_API_KEY` |
| Admin panel | `ADMIN_USER_IDS=<your telegram user id>` |

## Monorepo layout

```
packages/
  shared/     Domain model — zod schemas shared by every package
  analysis/   Deterministic history analysis (cadence, eras, style) — tested
  ai/         AI layer: tiers, prompt caching, style engine, grounded prompts — tested
  server/     API + bot + scheduler/autopilot + content pipeline + MTProto + persistence — tested
  miniapp/    Telegram-native React Mini App
```

## Commands

```bash
pnpm test          # 41 unit tests (analysis, style, prompts, cadence, RSS, entitlement)
pnpm typecheck     # all packages
pnpm build         # build every package
```

Detailed design and remaining hardening steps: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
