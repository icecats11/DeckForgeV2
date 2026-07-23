# DeckForge

MTG Commander deck analysis and generation — Scryfall + EDHREC + Commander
Spellbook data, with Claude-powered analysis. Live at
[thedeckforge.co.uk](https://thedeckforge.co.uk).

## Running locally

```bash
npm install
cp .env.example .env   # then fill in your keys
npm run dev
```

`npm run dev` starts two processes via `concurrently`:
- **Vite** on http://localhost:5173 — the React frontend (open this one)
- **Express** on http://localhost:3001 — the API handlers

Vite proxies `/api/*` to the Express server (see `vite.config.js`), so the
frontend and API behave exactly like production from a single URL.

### Environment variables (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Deck analysis and generation |
| `VITE_SUPABASE_URL` | No | Accounts, saved analyses, sharing, feedback |
| `VITE_SUPABASE_ANON_KEY` | No | As above |

Without the Supabase vars the app still works — auth/saving/sharing degrade
gracefully.

## Tests

```bash
npm test
```

Uses Node's built-in test runner (no extra dependencies). Covers the
decklist parser and the generated-deck validation/repair logic.

## Deploying (Vercel)

1. Push to GitHub, then in Vercel: **Add New → Project → Import** the repo.
   Vercel auto-detects Vite; `vercel.json` handles the rest (SPA rewrites,
   API function timeouts).
2. Add the environment variables above under **Settings → Environment
   Variables** (all environments).
3. Every push to `main` deploys to production; every PR gets its own
   preview URL — that's the easiest way to test changes on a real URL
   before they go live.

## Supabase setup

Run `supabase/policies.sql` in the Supabase SQL editor **before going
live** — it enables Row Level Security so users can only touch their own
rows, caps feedback/share sizes, and schedules expiry of old share links
(requires the `pg_cron` extension: Dashboard → Database → Extensions).

## Architecture notes

- `api/*.js` — Vercel serverless functions (also mounted by `server.js`
  for local dev). Shared helpers live in `api/_lib/` (underscore-prefixed
  so Vercel doesn't expose them as routes).
- Rate limiting happens **inside** each handler (`api/_lib/ratelimit.js`)
  because `server.js` middleware never runs on Vercel. It's per-instance;
  for a hard global limit swap in Upstash Redis.
- Generated decks are validated card-by-card against Scryfall and repaired
  to a legal 99 before being returned (`api/_lib/deck-validation.js`).
- Combo detection is deterministic via Commander Spellbook's
  `find-my-combos` API (`api/combos.js`), separate from the AI's
  suggested lines.
