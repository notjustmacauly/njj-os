-- ============================================================
-- NJJ OS v2 — Migration 13: Wix Integration Support
-- ============================================================
--   sync_state           — per-source watermark for incremental Wix syncs
--   integration_errors   — failure queue: every sync/push error lands here
--                          with full context, dismissable when resolved
--
-- The Edge Function (Phase 3) reads/writes these via service-role; admins
-- read them via the dashboard's "Needs Review" page.
-- ============================================================

-- ── sync_state ──────────────────────────────────────────────
create table if not exists public.sync_state (
  source             text primary key,                                   -- 'wix_orders', 'wix_tickets', 'wix_events'
  last_synced_at     timestamptz not null default '2026-05-01T00:00:00Z',
  last_run_at        timestamptz,
  last_run_status    text check (last_run_status in ('ok','error','running','never_run')),
  last_run_message   text,
  last_error         text,
  rows_processed     integer not null default 0,
  rows_added         integer not null default 0,
  rows_failed        integer not null default 0,
  updated_at         timestamptz not null default now()
);

comment on table public.sync_state is
  'One row per integration source. last_synced_at is the watermark — only events after it are pulled on the next run. Edge Function bumps this on success.';

-- Seed the two sources we know we need
insert into public.sync_state (source, last_run_status) values
  ('wix_orders',  'never_run'),
  ('wix_tickets', 'never_run')
on conflict (source) do nothing;

drop trigger if exists sync_state_set_updated_at on public.sync_state;
create trigger sync_state_set_updated_at before update on public.sync_state
  for each row execute function public.set_updated_at();

alter table public.sync_state enable row level security;

drop policy if exists "ops+ read sync_state" on public.sync_state;
create policy "ops+ read sync_state" on public.sync_state for select to authenticated
  using (current_user_role() in ('admin','manager','ops'));

drop policy if exists "admin manages sync_state" on public.sync_state;
create policy "admin manages sync_state" on public.sync_state for update to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- ── integration_errors ──────────────────────────────────────
create table if not exists public.integration_errors (
  id                  uuid primary key default gen_random_uuid(),
  occurred_at         timestamptz not null default now(),
  source              text not null,                                    -- 'wix_orders', 'wix_invoice_push', 'wix_webhook', etc.
  context             jsonb,                                            -- request body, Wix response, full debugging payload
  error_message       text not null,
  -- Optional refs to the row this error was about (for cross-linking)
  ref_type            text,                                             -- 'order','ticket','bill','event'
  ref_external_id     text,                                             -- e.g. Wix order number, our bill external_id
  -- Resolution
  resolved_at         timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolution_notes    text,
  created_at          timestamptz not null default now()
);

comment on table public.integration_errors is
  'Append-only error queue from Wix sync + write-back. Admin dashboard lists unresolved entries. resolved_at flag means "looked at, fixed, dismissed".';

create index if not exists idx_integration_errors_unresolved on public.integration_errors (occurred_at desc) where resolved_at is null;
create index if not exists idx_integration_errors_source     on public.integration_errors (source, occurred_at desc);
create index if not exists idx_integration_errors_ref        on public.integration_errors (ref_type, ref_external_id) where ref_external_id is not null;

alter table public.integration_errors enable row level security;

drop policy if exists "admin+manager read errors" on public.integration_errors;
create policy "admin+manager read errors" on public.integration_errors for select to authenticated
  using (current_user_role() in ('admin','manager'));

drop policy if exists "admin+manager resolve errors" on public.integration_errors;
create policy "admin+manager resolve errors" on public.integration_errors for update to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- ── log_integration_error() helper ──────────────────────────
-- Convenience function for the Edge Function to log errors. Always succeeds
-- (catches its own errors so logging never breaks the calling flow).
create or replace function public.log_integration_error(
  p_source           text,
  p_error_message    text,
  p_context          jsonb default null,
  p_ref_type         text default null,
  p_ref_external_id  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.integration_errors (source, error_message, context, ref_type, ref_external_id)
    values (p_source, p_error_message, p_context, p_ref_type, p_ref_external_id)
    returning id into v_id;
  return v_id;
exception when others then
  -- Logging must never break the caller. Swallow + return null.
  return null;
end; $$;

revoke all on function public.log_integration_error(text, text, jsonb, text, text) from public;
grant  execute on function public.log_integration_error(text, text, jsonb, text, text) to authenticated;

-- ── resolve_integration_error() helper ──────────────────────
create or replace function public.resolve_integration_error(
  p_id    uuid,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can resolve errors' using errcode = '42501';
  end if;
  update public.integration_errors
    set resolved_at         = now(),
        resolved_by_user_id = auth.uid(),
        resolution_notes    = p_notes
    where id = p_id and resolved_at is null;
end; $$;

revoke all on function public.resolve_integration_error(uuid, text) from public;
grant  execute on function public.resolve_integration_error(uuid, text) to authenticated;

-- ============================================================
-- End of migration 13
-- ============================================================
