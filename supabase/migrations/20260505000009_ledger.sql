-- ============================================================
-- NJJ OS v2 — Migration 9: Ledger (the source of truth for money)
-- ============================================================
--   ledger_entries     — append-only journal of every money movement
--   account_balances   — VIEW: opening_balance + sum(in) - sum(out)
--   ledger_apply()     — RPC: the ONLY way ledger entries are created
--
-- Design contract:
-- - ledger_entries is APPEND-ONLY. No updates, no deletes. Cancellations
--   happen by inserting a reversing entry with ref_type='reversal'.
-- - There is no "recompute" job. Balances are a function of the journal.
--   Adding the entry IS the source of truth, immediately and forever.
-- - Idempotency keys prevent double-credit when webhooks retry, when
--   network calls fail mid-flight, or when frontend double-submits.
-- - Direct inserts into ledger_entries are BLOCKED by RLS. The only path
--   in is via ledger_apply() which is security-definer and validates inputs.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_direction') then
    create type public.ledger_direction as enum ('in','out');
  end if;
end$$;

-- ── ledger_entries ──────────────────────────────────────────
create table if not exists public.ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  occurred_at         timestamptz not null default now(),
  account_code        text not null references public.accounts(code),
  direction           public.ledger_direction not null,
  amount              numeric(12,2) not null check (amount > 0),
  ref_type            text not null,                                          -- 'order','bill','expense','payment','transfer','manual','reversal'
  ref_id              uuid,                                                   -- the source row's id, when applicable
  ref_external_id     text,                                                   -- for display (e.g. 'ORD-260505-001')
  description         text,                                                   -- audit / display text
  idempotency_key     text unique,                                            -- prevents double-credit
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table public.ledger_entries is
  'Append-only journal of every money movement. The single source of truth for account balances. Reversals = new rows with ref_type=''reversal''.';

create index if not exists idx_ledger_account_at      on public.ledger_entries (account_code, occurred_at desc);
create index if not exists idx_ledger_ref             on public.ledger_entries (ref_type, ref_id) where ref_id is not null;
create index if not exists idx_ledger_occurred        on public.ledger_entries (occurred_at desc);
create index if not exists idx_ledger_account_dir_at  on public.ledger_entries (account_code, direction, occurred_at desc);

-- Audit trigger so we can also see WHO inserted (defense in depth even though
-- inserts only go through ledger_apply).
drop trigger if exists ledger_entries_audit on public.ledger_entries;
create trigger ledger_entries_audit
  after insert on public.ledger_entries
  for each row execute function public.audit_trigger();

alter table public.ledger_entries enable row level security;

drop policy if exists "ops+ read ledger_entries" on public.ledger_entries;
create policy "ops+ read ledger_entries"
  on public.ledger_entries for select
  to authenticated
  using (current_user_role() in ('admin','manager','ops'));

-- No insert/update/delete policies => writes only via ledger_apply (security definer).

-- ── account_balances VIEW ───────────────────────────────────
create or replace view public.account_balances as
select
  a.id,
  a.code,
  a.name,
  a.opening_balance,
  coalesce(in_t.amount, 0)  as total_in,
  coalesce(out_t.amount, 0) as total_out,
  a.opening_balance + coalesce(in_t.amount, 0) - coalesce(out_t.amount, 0) as current_balance,
  greatest(le_max.last_at, a.updated_at) as last_activity_at,
  a.is_active
from public.accounts a
left join (
  select account_code, sum(amount) as amount
  from public.ledger_entries
  where direction = 'in'
  group by account_code
) in_t on in_t.account_code = a.code
left join (
  select account_code, sum(amount) as amount
  from public.ledger_entries
  where direction = 'out'
  group by account_code
) out_t on out_t.account_code = a.code
left join (
  select account_code, max(occurred_at) as last_at
  from public.ledger_entries
  group by account_code
) le_max on le_max.account_code = a.code;

comment on view public.account_balances is
  'Account current balance computed live from ledger_entries. opening_balance + sum(in) - sum(out). No recompute job needed.';

-- ── ledger_apply() — the canonical entry point ──────────────
-- Validates inputs, checks idempotency, inserts an entry. This is the ONLY
-- way ledger entries get written. Other RPCs (mark order paid, pay bill,
-- reverse payment) call this internally inside their own transactions.
create or replace function public.ledger_apply(
  p_account_code     text,
  p_direction        text,
  p_amount           numeric,
  p_ref_type         text,
  p_ref_id           uuid    default null,
  p_ref_external_id  text    default null,
  p_description      text    default null,
  p_idempotency_key  text    default null,
  p_occurred_at      timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id    uuid;
  v_existing_id uuid;
begin
  if current_user_role() not in ('admin','manager','ops','staff') then
    raise exception 'insufficient privileges to write ledger' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive (got %)', p_amount using errcode = '22023';
  end if;

  if p_direction not in ('in','out') then
    raise exception 'direction must be ''in'' or ''out'' (got %)', p_direction using errcode = '22023';
  end if;

  -- Verify account exists
  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account_code: %', p_account_code using errcode = '23503';
  end if;

  -- Idempotency: same key returns existing entry, no double-credit
  if p_idempotency_key is not null then
    select id into v_existing_id
      from public.ledger_entries
      where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.ledger_entries (
    occurred_at, account_code, direction, amount,
    ref_type, ref_id, ref_external_id, description,
    idempotency_key, created_by_user_id
  ) values (
    p_occurred_at, p_account_code, p_direction::public.ledger_direction, p_amount,
    p_ref_type, p_ref_id, p_ref_external_id, p_description,
    p_idempotency_key, auth.uid()
  ) returning id into v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.ledger_apply is
  'The ONLY function that writes to ledger_entries. Validates inputs, enforces idempotency, returns existing entry_id when key already used.';

revoke all on function public.ledger_apply(text, text, numeric, text, uuid, text, text, text, timestamptz) from public;
grant  execute on function public.ledger_apply(text, text, numeric, text, uuid, text, text, text, timestamptz) to authenticated;

-- ── ledger_reverse() — companion for cancellations ──────────
-- Posts a reversing entry that cancels out a prior one. Also idempotent.
create or replace function public.ledger_reverse(
  p_original_entry_id uuid,
  p_reason            text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig             record;
  v_reverse_dir      public.ledger_direction;
  v_idempotency_key  text;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can reverse ledger entries' using errcode = '42501';
  end if;

  select * into v_orig from public.ledger_entries where id = p_original_entry_id;
  if not found then
    raise exception 'ledger entry not found: %', p_original_entry_id using errcode = '23503';
  end if;

  v_reverse_dir := case v_orig.direction when 'in' then 'out'::public.ledger_direction else 'in'::public.ledger_direction end;
  v_idempotency_key := 'reversal-of-' || p_original_entry_id::text;

  return public.ledger_apply(
    p_account_code    := v_orig.account_code,
    p_direction       := v_reverse_dir::text,
    p_amount          := v_orig.amount,
    p_ref_type        := 'reversal',
    p_ref_id          := v_orig.id,
    p_ref_external_id := v_orig.ref_external_id,
    p_description     := 'Reversal: ' || coalesce(p_reason, 'no reason given'),
    p_idempotency_key := v_idempotency_key,
    p_occurred_at     := now()
  );
end;
$$;

comment on function public.ledger_reverse is
  'Posts a reversing ledger entry. Idempotent via deterministic key (reversal-of-<id>) so re-calling does not double-reverse.';

revoke all on function public.ledger_reverse(uuid, text) from public;
grant  execute on function public.ledger_reverse(uuid, text) to authenticated;

-- ============================================================
-- End of migration 9
-- ============================================================
