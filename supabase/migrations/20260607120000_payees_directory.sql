-- =================================================================
-- Payee directory: a shared, auto-growing list of payees/vendors so
-- Payments, Expenses, and Releases can pick from past names instead of
-- retyping (and creating typo-duplicates). Free typing still works — a
-- brand-new name is used on the spot AND remembered for next time.
--
-- Design: this is an AUTOCOMPLETE dictionary, not a foreign key. The
-- transactions keep storing the name as text (payments.payee,
-- expenses.vendor, deductions.recipient). Renaming/hiding a payee here
-- only affects future suggestions; historical records are untouched.
-- =================================================================

create table if not exists public.payees (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  -- case/space-insensitive key used for dedup + lookups
  normalized_name    text generated always as (lower(btrim(name))) stored,
  is_active          boolean not null default true,
  notes              text,
  created_by_user_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- One live row per distinct name (ignores soft-deleted rows).
create unique index if not exists payees_normalized_name_uniq
  on public.payees (normalized_name)
  where deleted_at is null;

comment on table public.payees is
  'Autocomplete directory of payees/vendors for Payments, Expenses, Releases. Dictionary only — transactions still store the name as text.';

alter table public.payees enable row level security;

-- Everyone signed in can read the list (it feeds the pickers). All writes
-- go through the SECURITY DEFINER RPCs below, which enforce roles.
drop policy if exists payees_select on public.payees;
create policy payees_select on public.payees
  for select to authenticated using (true);

-- 1) upsert_payee: used by the forms' "auto-grow" — when a transaction is
--    saved with a payee/vendor/recipient name, remember it. Idempotent on
--    the normalized name; resurfaces a previously-hidden name if reused.
create or replace function public.upsert_payee(p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_norm text;
  v_id   uuid;
begin
  if p_name is null then return null; end if;
  v_norm := lower(btrim(p_name));
  if v_norm = '' then return null; end if;

  select id into v_id from public.payees
   where normalized_name = v_norm and deleted_at is null
   limit 1;

  if v_id is not null then
    update public.payees
       set is_active = true, updated_at = now()
     where id = v_id and is_active = false;
    return v_id;
  end if;

  insert into public.payees (name, created_by_user_id)
    values (btrim(p_name), auth.uid())
    returning id into v_id;
  return v_id;
end; $function$;

revoke all on function public.upsert_payee(text) from public;
grant execute on function public.upsert_payee(text) to authenticated;

-- 2) rename_payee: clean up a typo'd name. If the new name collides with an
--    existing live payee, this row is merged away (soft-deleted) so the list
--    stays free of duplicates.
create or replace function public.rename_payee(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_norm text;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to edit payees' using errcode = '42501';
  end if;
  v_norm := lower(btrim(coalesce(p_name, '')));
  if v_norm = '' then
    raise exception 'payee name cannot be empty' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.payees
     where normalized_name = v_norm and deleted_at is null and id <> p_id
  ) then
    -- a live payee with this name already exists -> merge: drop this one
    update public.payees set deleted_at = now(), updated_at = now()
     where id = p_id and deleted_at is null;
    return;
  end if;

  update public.payees
     set name = btrim(p_name), updated_at = now()
   where id = p_id and deleted_at is null;
end; $function$;

revoke all on function public.rename_payee(uuid, text) from public;
grant execute on function public.rename_payee(uuid, text) to authenticated;

-- 3) set_payee_active: hide/show a payee in the pickers without deleting it.
create or replace function public.set_payee_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to edit payees' using errcode = '42501';
  end if;
  update public.payees
     set is_active = coalesce(p_active, true), updated_at = now()
   where id = p_id and deleted_at is null;
end; $function$;

revoke all on function public.set_payee_active(uuid, boolean) from public;
grant execute on function public.set_payee_active(uuid, boolean) to authenticated;

-- 4) delete_payee: soft-delete (removes it from the directory entirely).
create or replace function public.delete_payee(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to delete payees' using errcode = '42501';
  end if;
  update public.payees set deleted_at = now(), updated_at = now()
   where id = p_id and deleted_at is null;
end; $function$;

revoke all on function public.delete_payee(uuid) from public;
grant execute on function public.delete_payee(uuid) to authenticated;

-- 5) Seed from every name ever typed on a payment, expense, or release.
insert into public.payees (name)
select distinct on (lower(btrim(src.name))) btrim(src.name)
from (
  select payee     as name from public.payments  where payee     is not null and btrim(payee)     <> ''
  union all
  select vendor    as name from public.expenses  where vendor    is not null and btrim(vendor)    <> ''
  union all
  select recipient as name from public.deductions where recipient is not null and btrim(recipient) <> ''
) src
where btrim(src.name) <> ''
order by lower(btrim(src.name)), btrim(src.name)
on conflict (normalized_name) where deleted_at is null do nothing;
