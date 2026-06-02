-- Notification delivery: per-device push subscriptions + per-user prefs.
-- Backs phone push + email notifications. The existing in-app `notifications`
-- table stays the single source of truth; these tables only control delivery.

-- ── Push subscriptions ─────────────────────────────────────────────
-- One row per browser/device that opted in to push. The endpoint + keys
-- come from the browser's PushManager.subscribe().
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage only their own device subscriptions. The dispatcher runs as
-- the service role and bypasses RLS to read everyone's.
create policy "own push subs - select"
  on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own push subs - insert"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);
-- Needed because subscribe() upserts on endpoint (re-subscribe / key refresh).
create policy "own push subs - update"
  on public.push_subscriptions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subs - delete"
  on public.push_subscriptions for delete using (auth.uid() = user_id);

-- ── Per-user notification preferences ──────────────────────────────
-- Absence of a row means "all on" (sensible default), enforced by the
-- dispatcher via coalesce(..., true).
create table if not exists public.notification_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled  boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "own prefs - select"
  on public.notification_prefs for select using (auth.uid() = user_id);
create policy "own prefs - insert"
  on public.notification_prefs for insert with check (auth.uid() = user_id);
create policy "own prefs - update"
  on public.notification_prefs for update using (auth.uid() = user_id);
