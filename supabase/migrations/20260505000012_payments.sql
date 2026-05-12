-- ============================================================
-- NJJ OS v2 — Migration 12: Payments
-- ============================================================
--   payments         — outflow approval queue (vendor pays, reimbursements,
--                      balance transfers between our own accounts)
--   create_payment_request() RPC — creates a pending payment
--   pay_payment()              RPC — atomic: status→paid + ledger entry/entries
--   cancel_payment()           RPC — cancel before paid; reversal if was paid
--
-- Compared to expenses (which are "we spent it, log it"), payments are
-- "request → approve → pay" with an audit trail of who requested/approved.
-- Both end up as ledger entries; both are visible in cash flow.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_type') then
    create type public.payment_type as enum ('general','reimbursement','transfer');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_request_status') then
    create type public.payment_request_status as enum ('pending','paid','cancelled');
  end if;
end$$;

-- ── payments ────────────────────────────────────────────────
create sequence if not exists public.payments_external_id_seq start 1;

create table if not exists public.payments (
  id                       uuid primary key default gen_random_uuid(),
  external_id              text unique,                                          -- 'PAY-260505-001'
  idempotency_key          text unique,
  type                     public.payment_type not null default 'general',
  purpose                  text not null,
  payee                    text,                                                  -- vendor name / staff name (for reimbursement)
  category                 text,                                                  -- like expense category
  amount                   numeric(12,2) not null check (amount > 0),
  account_code             text not null references public.accounts(code),        -- paid FROM
  transfer_to_account_code text references public.accounts(code),                  -- only when type='transfer'
  status                   public.payment_request_status not null default 'pending',
  requested_by_user_id     uuid references auth.users(id) on delete set null,
  requested_by_name        text,
  paid_at                  timestamptz,
  paid_date                date,
  paid_by_user_id          uuid references auth.users(id) on delete set null,
  ledger_entry_id_out      uuid references public.ledger_entries(id) on delete set null,
  ledger_entry_id_in       uuid references public.ledger_entries(id) on delete set null,    -- for transfers
  cancelled_at             timestamptz,
  cancelled_by_user_id     uuid references auth.users(id) on delete set null,
  cancel_reason            text,
  notes                    text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Transfers must specify a destination account that differs from source
  constraint payments_transfer_has_dest    check (type <> 'transfer' or transfer_to_account_code is not null),
  constraint payments_transfer_distinct    check (type <> 'transfer' or transfer_to_account_code <> account_code)
);

comment on table public.payments is
  'Outflow approval queue. Status: pending → paid (terminal) or pending → cancelled. Transfers post two ledger entries (out from source, in to dest).';

create index if not exists idx_payments_status        on public.payments (status) where deleted_at is null;
create index if not exists idx_payments_account       on public.payments (account_code, paid_date desc) where deleted_at is null;
create index if not exists idx_payments_paid_date     on public.payments (paid_date desc) where status = 'paid' and deleted_at is null;
create index if not exists idx_payments_type          on public.payments (type) where deleted_at is null;
create index if not exists idx_payments_requested_by  on public.payments (requested_by_user_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.audit_trigger();

create or replace function public.assign_payment_external_id()
returns trigger language plpgsql as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.created_at::date, current_date), 'YYMMDD');
    new.external_id := 'PAY-' || v_date_part || '-' ||
      lpad(nextval('public.payments_external_id_seq')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists payments_assign_external_id on public.payments;
create trigger payments_assign_external_id before insert on public.payments
  for each row execute function public.assign_payment_external_id();

alter table public.payments enable row level security;

drop policy if exists "ops+ read payments" on public.payments;
create policy "ops+ read payments" on public.payments for select to authenticated
  using (current_user_role() in ('admin','manager','ops') and deleted_at is null);

drop policy if exists "ops+ create payment requests" on public.payments;
create policy "ops+ create payment requests" on public.payments for insert to authenticated
  with check (
    current_user_role() in ('admin','manager','ops')
    and status = 'pending'                   -- requests start pending; paying happens via RPC
    and (type <> 'transfer' or current_user_role() in ('admin','manager'))   -- transfers admin/manager only
  );

drop policy if exists "admin+manager update payments" on public.payments;
create policy "admin+manager update payments" on public.payments for update to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- ── create_payment_request() RPC ────────────────────────────
-- Creates a pending payment that will be paid later via pay_payment().
create or replace function public.create_payment_request(
  p_idempotency_key  text,
  p_purpose          text,
  p_amount           numeric,
  p_account_code     text,
  p_type             text default 'general',
  p_payee            text default null,
  p_category         text default null,
  p_transfer_to_account_code text default null,
  p_notes            text default null,
  p_requested_by_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id          uuid;
  v_existing_id uuid;
begin
  if current_user_role() not in ('admin','manager','ops') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  if p_type = 'transfer' and current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can request transfers' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.payments where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.payments (
    idempotency_key, type, purpose, payee, category, amount,
    account_code, transfer_to_account_code, status,
    requested_by_user_id, requested_by_name, notes
  ) values (
    p_idempotency_key, p_type::public.payment_type, p_purpose, p_payee, p_category, p_amount,
    p_account_code, p_transfer_to_account_code, 'pending',
    auth.uid(), p_requested_by_name, p_notes
  ) returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.create_payment_request(text, text, numeric, text, text, text, text, text, text, text) from public;
grant  execute on function public.create_payment_request(text, text, numeric, text, text, text, text, text, text, text) to authenticated;

-- ── pay_payment() RPC ───────────────────────────────────────
-- Marks pending → paid and posts the ledger entries atomically.
-- For 'transfer' type: posts BOTH out-from-source and in-to-destination
-- in the same DB transaction. Idempotency keys derived from payment.id
-- ensure re-calls don't double-post.
create or replace function public.pay_payment(
  p_payment_id  uuid,
  p_paid_date   date default current_date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay      record;
  v_out_id   uuid;
  v_in_id    uuid;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can pay payments' using errcode = '42501';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found: %', p_payment_id using errcode = '23503';
  end if;

  if v_pay.status <> 'pending' then
    raise exception 'payment must be pending to pay (got %)', v_pay.status using errcode = '22023';
  end if;

  -- Out leg: source account
  v_out_id := public.ledger_apply(
    p_account_code    := v_pay.account_code,
    p_direction       := 'out',
    p_amount          := v_pay.amount,
    p_ref_type        := case when v_pay.type = 'transfer' then 'transfer' else 'payment' end,
    p_ref_id          := v_pay.id,
    p_ref_external_id := v_pay.external_id,
    p_description     := v_pay.purpose ||
      case when v_pay.type = 'transfer' then ' (transfer to ' || v_pay.transfer_to_account_code || ')' else '' end,
    p_idempotency_key := 'payment-out-' || v_pay.id::text,
    p_occurred_at     := p_paid_date::timestamptz
  );

  -- In leg (transfers only): destination account
  if v_pay.type = 'transfer' then
    v_in_id := public.ledger_apply(
      p_account_code    := v_pay.transfer_to_account_code,
      p_direction       := 'in',
      p_amount          := v_pay.amount,
      p_ref_type        := 'transfer',
      p_ref_id          := v_pay.id,
      p_ref_external_id := v_pay.external_id,
      p_description     := v_pay.purpose || ' (transfer from ' || v_pay.account_code || ')',
      p_idempotency_key := 'payment-in-' || v_pay.id::text,
      p_occurred_at     := p_paid_date::timestamptz
    );
  end if;

  update public.payments
    set status              = 'paid',
        paid_at             = now(),
        paid_date           = p_paid_date,
        paid_by_user_id     = auth.uid(),
        ledger_entry_id_out = v_out_id,
        ledger_entry_id_in  = v_in_id
    where id = p_payment_id;
end; $$;

comment on function public.pay_payment is
  'Atomic pay: pending → paid + posts ledger entries. Transfers post both legs (out from source, in to dest).';

revoke all on function public.pay_payment(uuid, date) from public;
grant  execute on function public.pay_payment(uuid, date) to authenticated;

-- ── cancel_payment() RPC ────────────────────────────────────
-- pending → cancelled (no ledger impact, since pending hasn't posted).
-- For paid payments, must use ledger_reverse on the linked entries (admin only).
create or replace function public.cancel_payment(
  p_payment_id  uuid,
  p_reason      text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay record;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can cancel payments' using errcode = '42501';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found' using errcode = '23503';
  end if;

  if v_pay.status = 'cancelled' then
    return;     -- idempotent
  end if;

  if v_pay.status = 'paid' then
    raise exception 'paid payments cannot be cancelled directly; use ledger_reverse on the linked ledger entry then update the payment manually' using errcode = '22023';
  end if;

  update public.payments
    set status               = 'cancelled',
        cancelled_at         = now(),
        cancelled_by_user_id = auth.uid(),
        cancel_reason        = p_reason
    where id = p_payment_id;
end; $$;

revoke all on function public.cancel_payment(uuid, text) from public;
grant  execute on function public.cancel_payment(uuid, text) to authenticated;

-- ============================================================
-- End of migration 12
-- ============================================================
