-- =================================================================
-- Standalone revenue entries.
--
-- Today: revenue is implicit — derived from orders.total (B2B) and
-- pos_transactions.total (events / counter sales). There's no way to
-- record one-off income that doesn't flow through either of those:
--   - corporate catering / supply contracts paid lump-sum
--   - private event bookings paid offline
--   - sponsorship payments
--   - rent (sublet a fridge, etc.)
--   - miscellaneous one-off receipts
--
-- This migration adds a first-class "revenue_entries" table for those.
-- Same shape as a cash-paid receivable from an ops perspective: pick a
-- category, pick the receiving account, post an inflow to the ledger.
--
-- Adds:
--   - revenue_category enum
--   - revenue_entries table
--   - log_revenue / void_revenue_entry RPCs
--   - Trigger to auto-assign REV-YYMMDD-NNN external_id
--
-- Role gating (matches the role matrix update in this same migration set):
--   - log_revenue          : owner / partner
--   - void_revenue_entry   : owner only (destructive)
--
-- Spec: ad-hoc (decided 2026-05-28). Categories: catering_contract,
-- event, sponsorship, rent, other.
--
-- DO NOT APPLY ahead of frontend changes. CC will apply this alongside
-- the Revenue page UI in the same deploy.
-- =================================================================

-- ---------- 1) revenue_category enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'revenue_category') then
    create type public.revenue_category as enum (
      'catering_contract',
      'event',
      'sponsorship',
      'rent',
      'other'
    );
  end if;
end$$;

-- ---------- 2) revenue_entries table
create table if not exists public.revenue_entries (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text unique,                       -- REV-YYMMDD-NNN, assigned by trigger
  revenue_date        date not null default current_date,
  category            public.revenue_category not null,
  description         text not null,                     -- short label, e.g. "Globe office catering — May"
  amount              numeric not null check (amount > 0),
  account_code        text not null references public.accounts(code),
  ledger_entry_id     uuid,                              -- the posted inflow
  notes               text,
  logged_by_user_id   uuid references auth.users(id),
  logged_by_name      text,
  voided_at           timestamptz,
  voided_by_user_id   uuid references auth.users(id),
  voided_by_name      text,
  void_reason         text,
  void_ledger_entry_id uuid,                             -- the counter-entry posted on void
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.revenue_entries is
  'Standalone income not tied to an order or POS transaction. Contracts, events, sponsorship, rent, misc.';
comment on column public.revenue_entries.category is
  'Bucketing for Revenue page reporting. Free-text "description" carries the actual narrative.';

create index if not exists revenue_entries_revenue_date_idx on public.revenue_entries(revenue_date);
create index if not exists revenue_entries_category_idx     on public.revenue_entries(category);

drop trigger if exists revenue_entries_set_updated_at on public.revenue_entries;
create trigger revenue_entries_set_updated_at before update on public.revenue_entries
  for each row execute function public.set_updated_at();

-- ---------- 3) RLS
-- Read: anyone who can see the Revenue page (owner/partner). We let
-- authenticated read and gate at the page level too. Writes go only
-- through the RPCs below.
alter table public.revenue_entries enable row level security;

drop policy if exists "revenue_entries owner/partner read" on public.revenue_entries;
create policy "revenue_entries owner/partner read" on public.revenue_entries
  for select to authenticated using (
    public.current_user_role() in ('owner','partner')
  );

-- ---------- 4) external_id trigger (REV-YYMMDD-NNN)
create or replace function public.assign_revenue_external_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq    int;
begin
  if new.external_id is not null then
    return new;
  end if;
  v_prefix := 'REV-' || to_char(coalesce(new.revenue_date, current_date), 'YYMMDD') || '-';
  select coalesce(max(substring(external_id from length(v_prefix) + 1)::int), 0) + 1
    into v_seq
    from public.revenue_entries
   where external_id like v_prefix || '%';
  new.external_id := v_prefix || lpad(v_seq::text, 3, '0');
  return new;
end; $$;

drop trigger if exists revenue_entries_assign_external_id on public.revenue_entries;
create trigger revenue_entries_assign_external_id
  before insert on public.revenue_entries
  for each row execute function public.assign_revenue_external_id();

-- ---------- 5) log_revenue RPC
-- Owner / Partner. Inserts the entry, posts an inflow via ledger_apply.
create or replace function public.log_revenue(
  p_revenue_date date,
  p_category     text,
  p_description  text,
  p_amount       numeric,
  p_account_code text,
  p_notes        text default null,
  p_logged_by_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_ext_id    text;
  v_ledger_id uuid;
begin
  if public.current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can log revenue' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description is required' using errcode = '22023';
  end if;
  if p_category is null then
    raise exception 'category is required' using errcode = '22023';
  end if;
  if p_account_code is null or length(trim(p_account_code)) = 0 then
    raise exception 'account_code is required' using errcode = '22023';
  end if;
  -- Validate account exists + is active.
  perform 1 from public.accounts
   where code = p_account_code and is_active = true;
  if not found then
    raise exception 'account % is not active', p_account_code using errcode = '23503';
  end if;

  -- Insert (the trigger will mint external_id).
  insert into public.revenue_entries (
    revenue_date, category, description, amount, account_code,
    notes, logged_by_user_id, logged_by_name
  ) values (
    coalesce(p_revenue_date, current_date),
    p_category::public.revenue_category,
    p_description,
    p_amount,
    p_account_code,
    p_notes,
    auth.uid(),
    p_logged_by_name
  ) returning id, external_id into v_id, v_ext_id;

  -- Post inflow.
  v_ledger_id := public.ledger_apply(
    p_account_code     := p_account_code,
    p_direction        := 'in',
    p_amount           := p_amount,
    p_ref_type         := 'revenue',
    p_ref_id           := v_id,
    p_ref_external_id  := v_ext_id,
    p_description      := 'Revenue ' || v_ext_id || ' — ' || p_description,
    p_idempotency_key  := 'rev-' || v_id::text,
    p_occurred_at      := coalesce(p_revenue_date, current_date)::timestamptz
  );

  update public.revenue_entries
     set ledger_entry_id = v_ledger_id,
         updated_at      = now()
   where id = v_id;

  return v_id;
end; $$;

revoke all on function public.log_revenue(date, text, text, numeric, text, text, text) from public;
grant execute on function public.log_revenue(date, text, text, numeric, text, text, text) to authenticated;

-- ---------- 6) void_revenue_entry RPC
-- Owner-only. Posts a counter-entry (direction='out') against the same
-- account so the ledger zeros out, then marks the row voided. Soft-delete
-- only — the row stays for audit. Idempotent: returns immediately if
-- already voided.
create or replace function public.void_revenue_entry(
  p_id     uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row            record;
  v_void_ledger_id uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only owner can void revenue entries' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'void reason is required' using errcode = '22023';
  end if;

  select * into v_row from public.revenue_entries
   where id = p_id and deleted_at is null;
  if not found then
    raise exception 'revenue entry not found' using errcode = '23503';
  end if;
  if v_row.voided_at is not null then
    return; -- already voided
  end if;

  -- Counter-entry: take the money back out of the same account.
  v_void_ledger_id := public.ledger_apply(
    p_account_code     := v_row.account_code,
    p_direction        := 'out',
    p_amount           := v_row.amount,
    p_ref_type         := 'revenue_void',
    p_ref_id           := v_row.id,
    p_ref_external_id  := v_row.external_id,
    p_description      := 'Void of revenue ' || v_row.external_id || ' — ' || p_reason,
    p_idempotency_key  := 'rev-void-' || v_row.id::text,
    p_occurred_at      := now()
  );

  update public.revenue_entries
     set voided_at            = now(),
         voided_by_user_id    = auth.uid(),
         void_reason          = p_reason,
         void_ledger_entry_id = v_void_ledger_id,
         updated_at           = now()
   where id = p_id;
end; $$;

revoke all on function public.void_revenue_entry(uuid, text) from public;
grant execute on function public.void_revenue_entry(uuid, text) to authenticated;

-- ---------- 7) Audit trigger
drop trigger if exists revenue_entries_audit on public.revenue_entries;
create trigger revenue_entries_audit after insert or update or delete on public.revenue_entries
  for each row execute function public.audit_trigger();
