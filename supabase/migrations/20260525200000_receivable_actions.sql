-- =================================================================
-- Receivable actions: "Bill" button + "Mark Paid (Cash)" button.
--
-- Today: an order marked Delivered auto-creates a 'pending' receivable
-- via the auto_create_receivable_on_delivery trigger. There's no path
-- from there to close the receivable:
--   - For partners on payment terms: a Bill needs to be drafted and
--     issued. There's no create_bill RPC; bills today have to be
--     inserted by direct SQL or whatever ad-hoc tooling existed.
--   - For partners who paid in cash on delivery: nothing actions the
--     receivable — it just sits as 'pending' forever.
--
-- Adds:
--   - Columns on receivables: paid_amount, paid_date, paid_account_code,
--     ledger_entry_id (mirrors the bills table shape)
--   - create_bill_for_receivable(p_receivable_id, p_bill_date, p_due_date,
--     p_payment_terms, p_delivery_fees, p_discount, p_notes) — creates a
--     draft bill with this single receivable attached, flips the receivable
--     to 'billed'. Owner-only (matches matrix: "Bills — issue, cancel"
--     is owner-only; drafting a bill is the entry point to that flow).
--   - mark_receivable_paid_cash(p_receivable_id, p_account_code, p_amount,
--     p_paid_date) — for cash-on-delivery payments. Posts cash inflow to
--     the chosen account, closes the receivable, marks the order paid.
--     Owner/Partner — matches "Receivables — view" gate. Manager doesn't
--     see receivables in the UI, so granting them this RPC would be a
--     surface they couldn't reach anyway.
--
-- DO NOT APPLY ahead of the frontend changes.
-- =================================================================

-- ---------- 1) receivables: payment columns
alter table public.receivables
  add column if not exists paid_amount        numeric,
  add column if not exists paid_date          date,
  add column if not exists paid_account_code  text,
  add column if not exists ledger_entry_id    uuid;

comment on column public.receivables.paid_account_code is
  'Account that received the cash payment. Set by mark_receivable_paid_cash for cash-on-delivery flow, or via the bill payment flow.';
comment on column public.receivables.ledger_entry_id is
  'Ledger entry created when the receivable was marked paid (cash path) or when its bill was paid.';

-- ---------- 2) create_bill_for_receivable
-- Owner-only. Drafts a bill for a single pending receivable, attaches it
-- via bill_receivables, transitions the receivable to 'billed'. The bill
-- starts in 'draft' status — Owner reviews + issues it via issue_bill.
create or replace function public.create_bill_for_receivable(
  p_receivable_id  uuid,
  p_bill_date      date    default current_date,
  p_due_date       date    default null,
  p_payment_terms  text    default null,
  p_delivery_fees  numeric default 0,
  p_discount       numeric default 0,
  p_notes          text    default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recv     record;
  v_bill_id  uuid;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can draft bills' using errcode = '42501';
  end if;

  select r.*, o.delivery_fee as order_delivery_fee
    into v_recv
    from public.receivables r
    join public.orders o on o.id = r.order_id
   where r.id = p_receivable_id and r.deleted_at is null;
  if not found then
    raise exception 'receivable not found' using errcode = '23503';
  end if;
  if v_recv.status <> 'pending' then
    raise exception 'receivable must be pending to bill (status = %)', v_recv.status
      using errcode = '22023';
  end if;

  insert into public.bills (
    partner_id, bill_date, due_date, payment_terms,
    subtotal, delivery_fees, discount, total,
    status, notes, created_by_user_id
  ) values (
    v_recv.partner_id, p_bill_date, p_due_date, p_payment_terms,
    v_recv.amount,
    coalesce(p_delivery_fees, 0),
    coalesce(p_discount, 0),
    v_recv.amount + coalesce(p_delivery_fees, 0) - coalesce(p_discount, 0),
    'draft', p_notes, auth.uid()
  ) returning id into v_bill_id;

  insert into public.bill_receivables (bill_id, receivable_id)
       values (v_bill_id, p_receivable_id);

  update public.receivables
     set status     = 'billed',
         bill_id    = v_bill_id,
         updated_at = now()
   where id = p_receivable_id;

  return v_bill_id;
end; $$;

revoke all on function public.create_bill_for_receivable(uuid, date, date, text, numeric, numeric, text) from public;
grant execute on function public.create_bill_for_receivable(uuid, date, date, text, numeric, numeric, text) to authenticated;

-- ---------- 3) mark_receivable_paid_cash
-- Closes a 'pending' receivable as paid in cash (or any account).
-- Posts the inflow to the chosen account via ledger_apply, then sets
-- receivable.status='paid' and the underlying order.payment_status='Paid'.
-- Owner / Partner / Manager — anyone who would normally be able to
-- mark a bill paid can do this. No bill is created.
create or replace function public.mark_receivable_paid_cash(
  p_receivable_id  uuid,
  p_account_code   text,
  p_amount         numeric,
  p_paid_date      date default current_date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recv      record;
  v_ledger_id uuid;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to mark receivables paid' using errcode = '42501';
  end if;
  if p_account_code is null or length(trim(p_account_code)) = 0 then
    raise exception 'account_code is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select r.*, o.external_id as order_external_id, o.id as order_id_full
    into v_recv
    from public.receivables r
    join public.orders o on o.id = r.order_id
   where r.id = p_receivable_id and r.deleted_at is null;
  if not found then
    raise exception 'receivable not found' using errcode = '23503';
  end if;
  if v_recv.status <> 'pending' then
    raise exception 'receivable must be pending to mark cash-paid (status = %). Already billed? Pay the bill instead.',
      v_recv.status using errcode = '22023';
  end if;

  v_ledger_id := public.ledger_apply(
    p_account_code     := p_account_code,
    p_direction        := 'in',
    p_amount           := p_amount,
    p_ref_type         := 'receivable',
    p_ref_id           := p_receivable_id,
    p_ref_external_id  := v_recv.external_id,
    p_description      := 'Receivable ' || coalesce(v_recv.external_id, p_receivable_id::text)
                          || ' paid in cash (order ' || coalesce(v_recv.order_external_id, '') || ')',
    p_idempotency_key  := 'recv-cash-' || p_receivable_id::text,
    p_occurred_at      := p_paid_date::timestamptz
  );

  update public.receivables
     set status            = 'paid',
         paid_amount       = p_amount,
         paid_date         = p_paid_date,
         paid_account_code = p_account_code,
         ledger_entry_id   = v_ledger_id,
         updated_at        = now()
   where id = p_receivable_id;

  update public.orders
     set payment_status = 'Paid',
         updated_at     = now()
   where id = v_recv.order_id;

  return v_ledger_id;
end; $$;

revoke all on function public.mark_receivable_paid_cash(uuid, text, numeric, date) from public;
grant execute on function public.mark_receivable_paid_cash(uuid, text, numeric, date) to authenticated;
