-- ============================================================
-- NJJ OS v2 — Migration 10: Expenses
-- ============================================================
--   expenses              — cash outflows (rent, supplies, vendor payments)
--   create_expense()  RPC — atomic: insert expense + ledger_apply (out)
--   void_expense()    RPC — atomic: soft-delete + ledger_reverse
--
-- Every expense is paired with exactly one ledger entry. The pair is
-- created in a single transaction; voiding posts a reversing ledger entry
-- in another single transaction. Idempotency keys prevent duplicate
-- expense rows on form double-tap.
-- ============================================================

-- ── expenses ────────────────────────────────────────────────
create sequence if not exists public.expenses_external_id_seq start 1;

create table if not exists public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text unique,                                          -- 'EXP-260505-001'
  expense_date        date not null default current_date,
  category            text not null,                                         -- freeform; common: Marketing, Logistics, Rent, Salaries, Supplies, Utilities, Misc
  description         text not null,
  vendor              text,
  amount              numeric(12,2) not null check (amount > 0),
  account_code        text not null references public.accounts(code),
  payment_ref         text,                                                  -- invoice / receipt number
  receipt_url         text,                                                  -- linked attachment
  notes               text,
  ledger_entry_id     uuid references public.ledger_entries(id) on delete set null,
  idempotency_key     text unique,
  logged_by_user_id   uuid references auth.users(id) on delete set null,
  logged_by_name      text,
  deleted_at          timestamptz,
  voided_at           timestamptz,                                           -- distinct from deleted_at: void = ledger reversed
  voided_by_user_id   uuid references auth.users(id) on delete set null,
  void_reason         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.expenses is
  'Cash outflows. Each expense pairs with exactly one ledger_entries row (ledger_entry_id). Voids create a reversing ledger entry, not a delete.';

create index if not exists idx_expenses_date         on public.expenses (expense_date desc) where deleted_at is null;
create index if not exists idx_expenses_account      on public.expenses (account_code, expense_date desc) where deleted_at is null;
create index if not exists idx_expenses_category     on public.expenses (category) where deleted_at is null;
create index if not exists idx_expenses_voided       on public.expenses (voided_at) where voided_at is not null;
create index if not exists idx_expenses_vendor       on public.expenses using gin (vendor gin_trgm_ops) where vendor is not null;

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();

drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_trigger();

create or replace function public.assign_expense_external_id()
returns trigger language plpgsql as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.expense_date, current_date), 'YYMMDD');
    new.external_id := 'EXP-' || v_date_part || '-' ||
      lpad(nextval('public.expenses_external_id_seq')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists expenses_assign_external_id on public.expenses;
create trigger expenses_assign_external_id before insert on public.expenses
  for each row execute function public.assign_expense_external_id();

alter table public.expenses enable row level security;

drop policy if exists "ops+ read expenses" on public.expenses;
create policy "ops+ read expenses" on public.expenses for select to authenticated
  using (current_user_role() in ('admin','manager','ops') and deleted_at is null);

drop policy if exists "admin+manager manage expenses" on public.expenses;
create policy "admin+manager manage expenses" on public.expenses for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

-- ── create_expense() RPC ────────────────────────────────────
-- Atomic: inserts expense + posts ledger entry. If either fails, both roll back.
create or replace function public.create_expense(
  p_idempotency_key text,
  p_amount          numeric,
  p_category        text,
  p_description     text,
  p_account_code    text,
  p_expense_date    date    default current_date,
  p_vendor          text    default null,
  p_payment_ref     text    default null,
  p_receipt_url     text    default null,
  p_notes           text    default null,
  p_logged_by_name  text    default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id   uuid;
  v_existing_id  uuid;
  v_ledger_id    uuid;
  v_external_id  text;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can create expenses' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  -- Idempotency
  if p_idempotency_key is not null then
    select id into v_existing_id from public.expenses where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  -- Insert expense first (without ledger_entry_id; we set it after the entry exists)
  insert into public.expenses (
    idempotency_key, amount, category, description, account_code,
    expense_date, vendor, payment_ref, receipt_url, notes,
    logged_by_user_id, logged_by_name
  ) values (
    p_idempotency_key, p_amount, p_category, p_description, p_account_code,
    p_expense_date, p_vendor, p_payment_ref, p_receipt_url, p_notes,
    auth.uid(), p_logged_by_name
  ) returning id, external_id into v_expense_id, v_external_id;

  -- Post the corresponding ledger entry (out)
  v_ledger_id := public.ledger_apply(
    p_account_code    := p_account_code,
    p_direction       := 'out',
    p_amount          := p_amount,
    p_ref_type        := 'expense',
    p_ref_id          := v_expense_id,
    p_ref_external_id := v_external_id,
    p_description     := p_description,
    p_idempotency_key := 'expense-' || v_expense_id::text,
    p_occurred_at     := p_expense_date::timestamptz
  );

  -- Backfill the ledger reference on the expense
  update public.expenses set ledger_entry_id = v_ledger_id where id = v_expense_id;

  return v_expense_id;
end;
$$;

comment on function public.create_expense is
  'Atomic expense creation: inserts expense row + posts ledger_entries row in a single transaction. Returns existing expense_id if idempotency_key already used.';

revoke all on function public.create_expense(text, numeric, text, text, text, date, text, text, text, text, text) from public;
grant  execute on function public.create_expense(text, numeric, text, text, text, date, text, text, text, text, text) to authenticated;

-- ── void_expense() RPC ──────────────────────────────────────
-- Posts a reversing ledger entry and stamps voided_at. Does NOT delete the
-- expense row — kept for audit trail. To fully hide from listings, set deleted_at separately.
create or replace function public.void_expense(
  p_expense_id  uuid,
  p_reason      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense  record;
  v_reversal uuid;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can void expenses' using errcode = '42501';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then
    raise exception 'expense not found: %', p_expense_id using errcode = '23503';
  end if;

  if v_expense.voided_at is not null then
    raise exception 'expense already voided' using errcode = '22023';
  end if;

  if v_expense.ledger_entry_id is null then
    raise exception 'expense has no linked ledger entry — cannot reverse' using errcode = '23502';
  end if;

  v_reversal := public.ledger_reverse(v_expense.ledger_entry_id, coalesce(p_reason, 'expense voided'));

  update public.expenses
    set voided_at         = now(),
        voided_by_user_id = auth.uid(),
        void_reason       = p_reason
    where id = p_expense_id;

  return v_reversal;
end;
$$;

comment on function public.void_expense is
  'Voids an expense by posting a reversing ledger entry. Expense row stays for audit; voided_at is stamped. Idempotent via underlying ledger_reverse.';

revoke all on function public.void_expense(uuid, text) from public;
grant  execute on function public.void_expense(uuid, text) to authenticated;

-- ============================================================
-- End of migration 10
-- ============================================================
