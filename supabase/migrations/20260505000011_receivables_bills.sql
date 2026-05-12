-- ============================================================
-- NJJ OS v2 — Migration 11: Receivables, Bills, Bill State Machine
-- ============================================================
--   receivables          — what each B2B order owes us, before billing
--   bills                — invoices to partners, with state machine
--   bill_receivables     — M:N junction (one bill can cover multiple orders)
--   bills_state_machine  — trigger enforces valid transitions
--   mark_bill_paid()     — atomic: bill→paid + receivables→paid + ledger entry
--   issue_bill()         — atomic: bill→issued, receivables→billed
--   cancel_bill()        — atomic: bill→cancelled (with ledger reversal if was paid)
--
-- Auto-creation: when a B2B order's fulfillment_status flips to 'Delivered',
-- a receivable is automatically created with status='pending'.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'receivable_status') then
    create type public.receivable_status as enum ('pending','billed','paid','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'bill_status') then
    create type public.bill_status as enum ('draft','issued','paid','cancelled');
  end if;
end$$;

-- ── receivables ─────────────────────────────────────────────
create sequence if not exists public.receivables_external_id_seq start 1;

create table if not exists public.receivables (
  id              uuid primary key default gen_random_uuid(),
  external_id     text unique,                                            -- 'RECV-260505-001'
  order_id        uuid not null references public.orders(id) on delete restrict,
  partner_id      uuid not null references public.partners(id) on delete restrict,
  amount          numeric(12,2) not null check (amount >= 0),               -- snapshot of order.total at delivery time
  status          public.receivable_status not null default 'pending',
  bill_id         uuid references public.bills(id) on delete set null,      -- forward ref; bills table created below
  due_date        date,
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (order_id)                                                          -- one receivable per order
);

-- ── bills ───────────────────────────────────────────────────
create sequence if not exists public.bills_external_id_seq start 1;

create table if not exists public.bills (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text unique,                                        -- 'BILL-260505-001'
  idempotency_key     text unique,
  partner_id          uuid not null references public.partners(id) on delete restrict,
  bill_date           date not null default current_date,
  due_date            date,
  payment_terms       text,                                                -- freeform per Mac's decision
  status              public.bill_status not null default 'draft',
  -- Maintained: subtotal = sum of linked receivables.amount
  subtotal            numeric(12,2) not null default 0,
  delivery_fees       numeric(12,2) not null default 0 check (delivery_fees >= 0),
  discount            numeric(12,2) not null default 0 check (discount >= 0),
  total               numeric(12,2) not null default 0,
  paid_amount         numeric(12,2) not null default 0 check (paid_amount >= 0),
  paid_date           date,
  paid_account_code   text references public.accounts(code),
  ledger_entry_id     uuid references public.ledger_entries(id) on delete set null,
  wix_invoice_id      text,                                                -- populated by Edge Function on write-back
  wix_invoice_url     text,                                                -- hosted invoice link from Wix
  issued_at           timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  notes               text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.bills is
  'Invoices to B2B partners. State machine: draft → issued → paid (terminal) | cancelled. mark_bill_paid() is the only path to paid status.';

create index if not exists idx_bills_partner_date on public.bills (partner_id, bill_date desc) where deleted_at is null;
create index if not exists idx_bills_status       on public.bills (status) where deleted_at is null;
create index if not exists idx_bills_due          on public.bills (due_date) where status = 'issued' and deleted_at is null;
create index if not exists idx_bills_wix_invoice  on public.bills (wix_invoice_id) where wix_invoice_id is not null;

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at before update on public.bills for each row execute function public.set_updated_at();

drop trigger if exists bills_audit on public.bills;
create trigger bills_audit after insert or update or delete on public.bills for each row execute function public.audit_trigger();

create or replace function public.assign_bill_external_id()
returns trigger language plpgsql as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.bill_date, current_date), 'YYMMDD');
    new.external_id := 'BILL-' || v_date_part || '-' ||
      lpad(nextval('public.bills_external_id_seq')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists bills_assign_external_id on public.bills;
create trigger bills_assign_external_id before insert on public.bills
  for each row execute function public.assign_bill_external_id();

-- now that bills exists, add the receivables → bills FK that was deferred above
-- (already declared in receivables ddl as a forward ref; just verify FK target exists)

-- Receivables external_id assignment + audit + updated_at
drop trigger if exists receivables_set_updated_at on public.receivables;
create trigger receivables_set_updated_at before update on public.receivables for each row execute function public.set_updated_at();

drop trigger if exists receivables_audit on public.receivables;
create trigger receivables_audit after insert or update or delete on public.receivables for each row execute function public.audit_trigger();

create or replace function public.assign_receivable_external_id()
returns trigger language plpgsql as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.created_at::date, current_date), 'YYMMDD');
    new.external_id := 'RECV-' || v_date_part || '-' ||
      lpad(nextval('public.receivables_external_id_seq')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists receivables_assign_external_id on public.receivables;
create trigger receivables_assign_external_id before insert on public.receivables
  for each row execute function public.assign_receivable_external_id();

create index if not exists idx_receivables_partner on public.receivables (partner_id, status) where deleted_at is null;
create index if not exists idx_receivables_status  on public.receivables (status) where deleted_at is null;
create index if not exists idx_receivables_bill    on public.receivables (bill_id) where bill_id is not null;
create index if not exists idx_receivables_order   on public.receivables (order_id);

alter table public.receivables enable row level security;

drop policy if exists "ops+ read receivables" on public.receivables;
create policy "ops+ read receivables" on public.receivables for select to authenticated
  using (current_user_role() in ('admin','manager','ops') and deleted_at is null);

drop policy if exists "admin+manager manage receivables" on public.receivables;
create policy "admin+manager manage receivables" on public.receivables for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

alter table public.bills enable row level security;

drop policy if exists "ops+ read bills" on public.bills;
create policy "ops+ read bills" on public.bills for select to authenticated
  using (current_user_role() in ('admin','manager','ops') and deleted_at is null);

drop policy if exists "admin+manager manage bills" on public.bills;
create policy "admin+manager manage bills" on public.bills for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

-- ── bill_receivables junction (M:N) ─────────────────────────
create table if not exists public.bill_receivables (
  bill_id        uuid not null references public.bills(id) on delete cascade,
  receivable_id  uuid not null references public.receivables(id) on delete cascade,
  primary key (bill_id, receivable_id)
);

create index if not exists idx_bill_receivables_recv on public.bill_receivables (receivable_id);

alter table public.bill_receivables enable row level security;

drop policy if exists "ops+ read bill_receivables" on public.bill_receivables;
create policy "ops+ read bill_receivables" on public.bill_receivables for select to authenticated
  using (current_user_role() in ('admin','manager','ops'));

drop policy if exists "admin+manager manage bill_receivables" on public.bill_receivables;
create policy "admin+manager manage bill_receivables" on public.bill_receivables for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

-- ── bill totals trigger ─────────────────────────────────────
create or replace function public.recompute_bill_totals(p_bill_id uuid)
returns void language plpgsql as $$
declare
  v_subtotal numeric(12,2);
  v_total    numeric(12,2);
  v_delivery numeric(12,2);
  v_discount numeric(12,2);
begin
  select coalesce(sum(r.amount), 0) into v_subtotal
  from public.bill_receivables br
  join public.receivables r on r.id = br.receivable_id
  where br.bill_id = p_bill_id;

  select delivery_fees, discount into v_delivery, v_discount
  from public.bills where id = p_bill_id;

  v_total := v_subtotal + coalesce(v_delivery, 0) - coalesce(v_discount, 0);
  if v_total < 0 then v_total := 0; end if;

  update public.bills
    set subtotal = v_subtotal, total = v_total
    where id = p_bill_id;
end; $$;

create or replace function public.bill_receivables_after_change()
returns trigger language plpgsql as $$
declare v_bill_id uuid;
begin
  v_bill_id := coalesce((new).bill_id, (old).bill_id);
  perform public.recompute_bill_totals(v_bill_id);
  return null;
end; $$;

drop trigger if exists bill_receivables_recompute on public.bill_receivables;
create trigger bill_receivables_recompute after insert or update or delete on public.bill_receivables
  for each row execute function public.bill_receivables_after_change();

create or replace function public.bills_recompute_on_pricing_change()
returns trigger language plpgsql as $$
begin
  if (old.delivery_fees is distinct from new.delivery_fees) or
     (old.discount      is distinct from new.discount) then
    perform public.recompute_bill_totals(new.id);
  end if;
  return null;
end; $$;

drop trigger if exists bills_recompute_on_pricing_change on public.bills;
create trigger bills_recompute_on_pricing_change after update on public.bills
  for each row execute function public.bills_recompute_on_pricing_change();

-- ── bill state machine trigger ──────────────────────────────
create or replace function public.bills_enforce_state_machine()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'new bills must start in draft status (got %)', new.status using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status is not distinct from new.status then return new; end if;

  -- Terminal states cannot transition out
  if old.status = 'paid' then
    raise exception 'cannot transition out of paid status' using errcode = '22023';
  end if;
  if old.status = 'cancelled' then
    raise exception 'cannot transition out of cancelled status' using errcode = '22023';
  end if;

  -- Specific allowed transitions
  case new.status
    when 'issued' then
      if old.status <> 'draft' then
        raise exception 'can only issue a bill from draft (got %)', old.status using errcode = '22023';
      end if;
    when 'paid' then
      if old.status <> 'issued' then
        raise exception 'can only mark paid from issued (got %)', old.status using errcode = '22023';
      end if;
    when 'cancelled' then
      if old.status not in ('draft','issued') then
        raise exception 'can only cancel from draft or issued (got %)', old.status using errcode = '22023';
      end if;
    when 'draft' then
      raise exception 'cannot transition to draft' using errcode = '22023';
  end case;

  return new;
end; $$;

drop trigger if exists bills_state_machine on public.bills;
create trigger bills_state_machine before insert or update on public.bills
  for each row execute function public.bills_enforce_state_machine();

-- ── auto-create receivable when B2B order is delivered ─────
create or replace function public.auto_create_receivable_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  if old.fulfillment_status is distinct from new.fulfillment_status
     and new.fulfillment_status = 'Delivered'
     and new.channel = 'B2B'
     and new.partner_id is not null
  then
    select id into v_existing_id from public.receivables where order_id = new.id;
    if v_existing_id is null then
      insert into public.receivables (order_id, partner_id, amount, status)
        values (new.id, new.partner_id, new.total, 'pending');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists orders_auto_receivable on public.orders;
create trigger orders_auto_receivable after update on public.orders
  for each row execute function public.auto_create_receivable_on_delivery();

-- ── issue_bill() ────────────────────────────────────────────
-- Marks a draft bill as issued and bumps linked receivables to 'billed'.
-- Wix invoice write-back is a separate step (Edge Function in Phase 3).
create or replace function public.issue_bill(p_bill_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can issue bills' using errcode = '42501';
  end if;

  update public.bills set status = 'issued', issued_at = now() where id = p_bill_id;

  update public.receivables set status = 'billed'
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);
end; $$;

revoke all on function public.issue_bill(uuid) from public;
grant  execute on function public.issue_bill(uuid) to authenticated;

-- ── mark_bill_paid() ────────────────────────────────────────
-- Atomic: bill → paid, receivables → paid, linked orders → paid, ledger entry.
create or replace function public.mark_bill_paid(
  p_bill_id        uuid,
  p_account_code   text,
  p_paid_amount    numeric,
  p_paid_date      date default current_date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_bill        record;
  v_ledger_id   uuid;
  v_order_id    uuid;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can mark bills paid' using errcode = '42501';
  end if;

  select * into v_bill from public.bills where id = p_bill_id;
  if not found then raise exception 'bill not found' using errcode = '23503'; end if;

  if v_bill.status <> 'issued' then
    raise exception 'bill must be in issued status to mark paid (got %)', v_bill.status using errcode = '22023';
  end if;

  if p_paid_amount is null or p_paid_amount <= 0 then
    raise exception 'paid_amount must be positive' using errcode = '22023';
  end if;

  -- Post ledger entry (in)
  v_ledger_id := public.ledger_apply(
    p_account_code    := p_account_code,
    p_direction       := 'in',
    p_amount          := p_paid_amount,
    p_ref_type        := 'bill',
    p_ref_id          := p_bill_id,
    p_ref_external_id := v_bill.external_id,
    p_description     := 'Bill ' || v_bill.external_id || ' paid',
    p_idempotency_key := 'bill-paid-' || p_bill_id::text,
    p_occurred_at     := p_paid_date::timestamptz
  );

  -- Update bill (state machine trigger validates the transition)
  update public.bills
    set status            = 'paid',
        paid_amount       = p_paid_amount,
        paid_date         = p_paid_date,
        paid_account_code = p_account_code,
        ledger_entry_id   = v_ledger_id
    where id = p_bill_id;

  -- Cascade: linked receivables → paid; linked orders' payment_status → 'Paid'
  for v_order_id in
    select r.order_id
    from public.bill_receivables br
    join public.receivables r on r.id = br.receivable_id
    where br.bill_id = p_bill_id
  loop
    update public.orders set payment_status = 'Paid' where id = v_order_id;
  end loop;

  update public.receivables set status = 'paid'
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);

  return v_ledger_id;
end; $$;

comment on function public.mark_bill_paid is
  'Atomic: marks a bill paid, posts the inbound ledger entry, cascades receivable status to paid, and updates linked orders'' payment_status.';

revoke all on function public.mark_bill_paid(uuid, text, numeric, date) from public;
grant  execute on function public.mark_bill_paid(uuid, text, numeric, date) to authenticated;

-- ── cancel_bill() ───────────────────────────────────────────
create or replace function public.cancel_bill(p_bill_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_bill record;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can cancel bills' using errcode = '42501';
  end if;

  select * into v_bill from public.bills where id = p_bill_id;
  if not found then raise exception 'bill not found' using errcode = '23503'; end if;

  update public.bills
    set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
    where id = p_bill_id;

  -- Bump linked receivables back to 'pending' so they can be re-billed
  update public.receivables set status = 'pending', bill_id = null
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);

  -- Junction kept for audit trail; could delete for cleanliness, but history > cleanliness here.
end; $$;

revoke all on function public.cancel_bill(uuid, text) from public;
grant  execute on function public.cancel_bill(uuid, text) to authenticated;

-- ============================================================
-- End of migration 11
-- ============================================================
