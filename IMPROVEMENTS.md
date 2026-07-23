# DeckForge — Code Review & Improvements (July 2026)

## What was changed

### 1. Rate limiting that actually runs in production (critical — cost)
`express-rate-limit` in `server.js` only protects local dev. On Vercel,
`server.js` never runs — each `api/*.js` file is invoked directly as a
serverless function, so `/api/analyse` and `/api/generate` had **zero**
rate limiting in production. Anyone could loop requests and burn Anthropic
credits.

- New `api/_lib/ratelimit.js` — sliding-window limiter called *inside* each
  handler (analyse: 6/min, generate: 4/min, combos: 10/min per IP).
- This is per-serverless-instance, so it's a mitigation, not a hard cap.
  For a hard global limit, swap in `@upstash/ratelimit` + Upstash Redis
  (free tier) — the helper is structured so it's a one-file change.

### 2. Model IDs fixed (critical — both AI endpoints likely broken)
- `api/analyse.js`: `claude-opus-4-6` → `claude-opus-4-8`
- `api/generate.js`: `claude-opus-4-5` → `claude-sonnet-4-6`
  (generation is now validated server-side — see below — so the cheaper
  model is fine here; analysis keeps Opus for quality)

### 3. Server-side validation of generated decks (credibility)
LLM-generated decklists routinely contain hallucinated cards, colour
identity violations, and off-by-a-few counts. `api/generate.js` now:
- Parses the generated list server-side
- Verifies **every card** against Scryfall's collection endpoint
- Drops cards that don't exist, aren't Commander-legal, break colour
  identity, or duplicate the commander; enforces singleton
- Filters basics outside the identity; tops the deck back up to exactly
  99 with basics in the commander's colours (or trims overage)
- Returns a `validation` report, which the frontend now prints into the
  diagnostic log so you can see exactly what was repaired

### 4. Deterministic combo detection via Commander Spellbook (new feature)
"What combos does my deck contain" is now answered with community-verified
data instead of an LLM's opinion:
- New `api/combos.js` proxies `https://backend.commanderspellbook.com/find-my-combos`
- `Results.jsx` shows a **Detected Combos** panel: combos fully in the deck
  (with links to the Spellbook combo page) plus "one card away" near-misses —
  which double as high-signal upgrade suggestions
- The old Claude panel is relabelled **AI-Suggested Lines** so users can
  tell verified data from AI analysis
- ⚠️ I could not hit the live API from this environment, so the response
  parsing is written defensively (handles `{card:{name}}`, `{name}`, and
  string shapes) — **test this endpoint first** and adjust `simplify()` in
  `api/combos.js` if the upstream shape differs

### 5. Generate-by-commander (the missing feature)
The generate section now has an optional commander input. The server:
- Resolves the name via Scryfall fuzzy lookup (typo-tolerant)
- Rejects cards that can't legally be a commander
- Feeds Claude the real card text + colour identity, which sharply reduces
  identity violations in the generated 99

### 6. Token-cost hardening on /api/analyse
The client sends full oracle text, so the payload size was entirely
client-controlled. The handler now caps: ≤110 cards, oracle text truncated
to 500 chars/card, name/type length limits, qty clamped 1–99.

### 7. Smaller fixes
- `extractText()` helper: Anthropic responses can contain multiple content
  blocks; `message.content[0]?.text` breaks if a non-text block comes first
- Shared `applyCors()` — the same 8-line CORS block was copy-pasted into
  four handlers
- Parser: added missing `Snow-Covered Wastes` basic
- `server.js`: registered `/api/combos` for local dev

## Round 2 — all previously recommended items now implemented

- **Supabase RLS**: full policy set in `supabase/policies.sql` (run it in the
  SQL editor before going live) — per-user access on `analyses`, write-only
  `feedback` with a 4000-char DB constraint, public-but-capped `shares` with
  a 90-day pg_cron expiry job.
- **Share endpoint hardening**: rate limited (5/min), 400KB payload cap,
  mirrored by a DB size constraint.
- **Feedback endpoint**: rate limited (3/min), 4000-char cap.
- **Pricing**: new `src/utils/price.js` — Cardmarket EUR prices preferred
  (matches the Buy button), TCGplayer USD fallback, single place for FX
  rates. Expensive-card threshold is now £12 end-to-end.
- **EDHREC slugs**: handle DFC commanders (front face), partner pairs
  ("A + B" → "a-b"), and accented names.
- **Auth**: register form now warns that username-only accounts have no
  password recovery.
- **Long-request resilience**: both AI endpoints use streaming accumulation
  and `vercel.json` sets `maxDuration: 60` for them (check your Vercel plan
  allows 60s; lower it if not).
- **Tests**: `npm test` — 18 cases on the decklist parser and the
  generated-deck repair logic using Node's built-in runner (zero new
  dependencies). Validation logic was extracted to
  `api/_lib/deck-validation.js` to make it purely testable.
- **Docs**: added `README.md` (run/deploy instructions) and `.env.example`.

## Deliberately NOT changed

- Username-as-email auth itself: replacing it with real email/OAuth is a
  product decision; the warning + docs cover the risk for now.
- Live FX rates: hardcoded EUR/USD→GBP approximations are fine for display;
  swap in an FX API only if price accuracy starts to matter.

## Original review notes (round 1)

### Supabase Row Level Security — verify this before anything else
The client deletes analyses with `.delete().eq('id', id)` and
`loadSupabaseAnalyses()` selects without a `user_id` filter. Both are safe
**only** if RLS is enabled with correct policies. Run in the SQL editor:

```sql
alter table analyses enable row level security;
create policy "own rows select" on analyses for select using (auth.uid() = user_id);
create policy "own rows insert" on analyses for insert with check (auth.uid() = user_id);
create policy "own rows delete" on analyses for delete using (auth.uid() = user_id);

alter table feedback enable row level security;
create policy "anyone can insert" on feedback for insert with check (true);
-- no select policy: feedback is write-only from the client

alter table shares enable row level security;
create policy "anyone can read"   on shares for select using (true);
create policy "anyone can insert" on shares for insert with check (true);
-- consider: a size cap via a check constraint, and a cron to expire old rows
```
Without RLS, any visitor can read/delete every user's rows using the anon
key from your bundle.

### Other worthwhile items
- **Share row abuse**: `/api/share` accepts unauthenticated inserts of
  arbitrary JSON (full Scryfall maps → big rows). Add the rate limiter to
  it, cap `JSON.stringify(body).length`, and add a TTL/cleanup job.
- **Username-as-email auth** (`@deckforge.internal`): works, but users can
  never reset a password. Fine for a hobby app; disable Supabase email
  confirmations for these addresses, and consider real email or OAuth later.
- **Prices**: you convert Scryfall USD → GBP at a hardcoded 0.79. Scryfall
  also returns `prices.eur` (Cardmarket-sourced), which is more relevant
  for your Cardmarket buy button — consider EUR display or EUR→GBP.
- **EDHREC slugs** don't handle partner pairs or DFC commanders
  (`A // B`) — slugify the front face and, for partners, `a-b` joined slug.
- **Streaming**: analysis takes a while on Opus; the Messages API streaming
  mode + incremental UI would improve perceived speed a lot.
- **Testing**: `parser.js` and `validateAndRepair()` are pure-ish functions
  crying out for a handful of Vitest cases (Moxfield export, Archidekt
  export, foil markers, MDFCs, partner commanders).
