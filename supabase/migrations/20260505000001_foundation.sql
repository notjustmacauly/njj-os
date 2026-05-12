-- ============================================================
-- NJJ OS v2 — Migration 1: Foundation
-- ============================================================
-- Sets up: extensions, role enum, user_roles table, audit_log,
-- and reusable trigger functions used by every subsequent table.
--
-- No business tables yet; those come in migrations 2+.
-- Idempotent: safe to re-run during development.
-- ============================================================

-- ── Required Postgres extensions ─────────────────────────────
create extension if not exists pgcrypto;        -- gen_random_uuid()
create extension if not exists pg_trgm;         -- fuzzy text search (later: customer name lookup)

-- ── Role enum ────────────────────────────────────────────────
-- Flat role hierarchy: admin > manager > ops > staff. See AUTH.md for the
-- permission matrix. Adding a new role = adding to this enum + extending
-- the matrix. Don't introduce a parallel "permissions" table — keep it simple.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'manager', 'ops', 'staff');
  end if;
end$$;

-- ── user_roles ───────────────────────────────────────────────
-- One role per auth.users row. Supabase Auth manages auth.users; this
-- table attaches our authorization data to it.
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is 'Role assignment per authenticated user. Exactly one role per user.';

-- ── current_user_role() helper ───────────────────────────────
-- Returns the current authenticated user's role, or null if unauthenticated.
-- Used by every RLS policy below. SECURITY DEFINER so it can read user_roles
-- regardless of the calling user's RLS context.
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

comment on function public.current_user_role() is
  'Returns the current authenticated user''s role for use in RLS policies. Null if unauthenticated or no role assigned.';

revoke all on function public.current_user_role() from public;
grant  execute on function public.current_user_role() to authenticated;

-- ── user_roles RLS ───────────────────────────────────────────
alter table public.user_roles enable row level security;

drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid() or current_user_role() = 'admin');

drop policy if exists "admin manages roles" on public.user_roles;
create policy "admin manages roles"
  on public.user_roles for all
  to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- ── Reusable updated_at trigger ──────────────────────────────
-- Auto-stamps updated_at = now() on every UPDATE. Wired onto every mutable
-- table by subsequent migrations: `create trigger ... execute function set_updated_at()`.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- ── audit_log ────────────────────────────────────────────────
-- Append-only mutation history. Populated automatically by audit_trigger()
-- on every protected table. Lets us answer "who deleted that order?" months
-- later. Read-only from the frontend; never directly mutated.
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,                                          -- denormalized in case user later deleted
  actor_role   public.app_role,
  action       text not null check (action in ('insert','update','delete')),
  table_name   text not null,
  row_id       uuid,
  before       jsonb,                                         -- null for inserts
  after        jsonb                                          -- null for deletes
);

create index if not exists idx_audit_log_table_row on public.audit_log (table_name, row_id);
create index if not exists idx_audit_log_actor     on public.audit_log (actor_id);
create index if not exists idx_audit_log_occurred  on public.audit_log (occurred_at desc);

comment on table public.audit_log is
  'Append-only mutation history. Populated by audit_trigger() on each protected table. Never written from the frontend.';

alter table public.audit_log enable row level security;

drop policy if exists "admin reads everything" on public.audit_log;
create policy "admin reads everything"
  on public.audit_log for select
  to authenticated
  using (current_user_role() = 'admin');

drop policy if exists "non-admin reads own actions" on public.audit_log;
create policy "non-admin reads own actions"
  on public.audit_log for select
  to authenticated
  using (
    current_user_role() in ('manager','ops')
    and actor_id = auth.uid()
  );

-- No insert/update/delete policies => writes only via the trigger function below
-- (which runs SECURITY DEFINER and bypasses RLS for its inserts).

-- ── Reusable audit_trigger() ─────────────────────────────────
-- Generic INSERT/UPDATE/DELETE capture. Attached to a table with:
--   create trigger <name>_audit
--     after insert or update or delete on <table>
--     for each row execute function audit_trigger();
-- Assumes the table has a column named "id" of type uuid.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_actor_role  public.app_role;
  v_row_id      uuid;
begin
  select email into v_actor_email from auth.users where id = auth.uid();
  v_actor_role := current_user_role();

  if tg_op = 'DELETE' then
    v_row_id := (old).id;
    insert into public.audit_log
      (actor_id, actor_email, actor_role, action, table_name, row_id, before)
    values
      (auth.uid(), v_actor_email, v_actor_role, 'delete', tg_table_name, v_row_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    v_row_id := (new).id;
    insert into public.audit_log
      (actor_id, actor_email, actor_role, action, table_name, row_id, before, after)
    values
      (auth.uid(), v_actor_email, v_actor_role, 'update', tg_table_name, v_row_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'INSERT' then
    v_row_id := (new).id;
    insert into public.audit_log
      (actor_id, actor_email, actor_role, action, table_name, row_id, after)
    values
      (auth.uid(), v_actor_email, v_actor_role, 'insert', tg_table_name, v_row_id, to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

comment on function public.audit_trigger() is
  'Reusable trigger function. Logs every insert/update/delete to audit_log. Attach via: create trigger <name>_audit after insert or update or delete on <table> for each row execute function audit_trigger();';

-- ============================================================
-- End of migration 1
-- ============================================================
