-- ═══════════════════════════════════════════════════════════════════════════
-- DeckForge — Supabase security setup
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: policies are dropped before being recreated.
--
-- WHY THIS MATTERS: the anon key ships inside your JS bundle. Without RLS,
-- anyone can use it to read/modify/delete EVERY row in these tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── analyses: private, per-user ─────────────────────────────────────────────
alter table analyses enable row level security;

drop policy if exists "analyses own select" on analyses;
drop policy if exists "analyses own insert" on analyses;
drop policy if exists "analyses own delete" on analyses;

create policy "analyses own select" on analyses
  for select using (auth.uid() = user_id);
create policy "analyses own insert" on analyses
  for insert with check (auth.uid() = user_id);
create policy "analyses own delete" on analyses
  for delete using (auth.uid() = user_id);
-- No update policy: the app never updates analyses, so don't allow it.

-- ── feedback: write-only from the public ────────────────────────────────────
alter table feedback enable row level security;

drop policy if exists "feedback public insert" on feedback;
create policy "feedback public insert" on feedback
  for insert with check (true);
-- Intentionally no select/update/delete policies: visitors can submit
-- feedback but can't read anyone else's. Read it via the dashboard.

-- Guard against megabyte-sized junk submissions
alter table feedback drop constraint if exists feedback_length_cap;
alter table feedback add constraint feedback_length_cap
  check (char_length(feedback) <= 4000);

-- ── shares: public read + public create, capped and expiring ────────────────
alter table shares enable row level security;

drop policy if exists "shares public select" on shares;
drop policy if exists "shares public insert" on shares;

create policy "shares public select" on shares
  for select using (true);
create policy "shares public insert" on shares
  for insert with check (true);
-- No update/delete from the client.

-- Size cap (mirrors the 400KB cap in api/share.js — defence in depth)
alter table shares drop constraint if exists shares_size_cap;
alter table shares add constraint shares_size_cap
  check (pg_column_size(data) + coalesce(pg_column_size(scryfall_data), 0) <= 500000);

-- Expire shares after 90 days so the table can't grow forever.
-- Requires the pg_cron extension: Dashboard → Database → Extensions → pg_cron.
-- (Needs a created_at column; add one if the table predates it.)
alter table shares add column if not exists created_at timestamptz default now();

select cron.schedule(
  'expire-old-shares',
  '30 3 * * *',  -- daily at 03:30 UTC
  $$ delete from shares where created_at < now() - interval '90 days' $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify afterwards:
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('analyses','feedback','shares');
-- rowsecurity should be true for all three.
--
-- Then test in an incognito window while signed out: saved analyses must
-- NOT load, and share links must still work.
-- ═══════════════════════════════════════════════════════════════════════════
