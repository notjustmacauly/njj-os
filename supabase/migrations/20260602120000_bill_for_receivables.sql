-- Group multiple receivables under one bill.
--
-- create_bill_for_receivable() (singular) only ever attached one receivable,
-- so the UI forced one bill per order. This adds the plural counterpart:
-- create_bill_for_receivables(uuid[]) drafts a single bill and attaches every
-- selected receivable. The bill_receivables_recompute trigger already sums the
-- junction rows into the bill subtotal, so the total comes out right.
--
-- Constraints (same spirit as the singular RPC):
--   * Owner-only (drafting a bill is the entry point to the owner-only
--     issue/cancel flow).
--   * Every receivable must be 'pending' and not deleted.
--   * All must belong to the SAME partner — a bill is addressed to one partner.

create or replace function public.create_bill_for_receivables(
  p_receivable_ids uuid[],
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
  v_bill_id       uuid;
  v_partner_id    uuid;
  v_partner_count int;
  v_subtotal      numeric(12,2);
  v_found         int;
  v_not_pending   int;
  v_requested     int;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can draft bills' using errcode = '42501';
  end if;

  v_requested := coalesce(array_length(p_receivable_ids, 1), 0);
  if v_requested = 0 then
    raise exception 'select at least one receivable to bill' using errcode = '22023';
  end if;

  -- All requested ids must resolve to live receivables.
  select count(*) into v_found
    from public.receivables
   where id = any(p_receivable_ids) and deleted_at is null;
  if v_found <> v_requested then
    raise exception 'some selected receivables were not found' using errcode = '23503';
  end if;

  -- Every one must still be pending.
  select count(*) into v_not_pending
    from public.receivables
   where id = any(p_receivable_ids) and deleted_at is null and status <> 'pending';
  if v_not_pending > 0 then
    raise exception 'every selected receivable must be pending to bill' using errcode = '22023';
  end if;

  -- One partner per bill.
  select count(distinct partner_id), min(partner_id), coalesce(sum(amount), 0)
    into v_partner_count, v_partner_id, v_subtotal
    from public.receivables
   where id = any(p_receivable_ids) and deleted_at is null;
  if v_partner_count <> 1 then
    raise exception 'all receivables on one bill must belong to the same partner'
      using errcode = '22023';
  end if;

  insert into public.bills (
    partner_id, bill_date, due_date, payment_terms,
    subtotal, delivery_fees, discount, total,
    status, notes, created_by_user_id
  ) values (
    v_partner_id, p_bill_date, p_due_date, p_payment_terms,
    v_subtotal,
    coalesce(p_delivery_fees, 0),
    coalesce(p_discount, 0),
    v_subtotal + coalesce(p_delivery_fees, 0) - coalesce(p_discount, 0),
    'draft', p_notes, auth.uid()
  ) returning id into v_bill_id;

  -- Attach all receivables. The junction trigger recomputes bill totals.
  insert into public.bill_receivables (bill_id, receivable_id)
  select v_bill_id, id
    from public.receivables
   where id = any(p_receivable_ids) and deleted_at is null;

  update public.receivables
     set status     = 'billed',
         bill_id    = v_bill_id,
         updated_at = now()
   where id = any(p_receivable_ids) and deleted_at is null;

  return v_bill_id;
end; $$;

revoke all on function public.create_bill_for_receivables(uuid[], date, date, text, numeric, numeric, text) from public;
grant execute on function public.create_bill_for_receivables(uuid[], date, date, text, numeric, numeric, text) to authenticated;
