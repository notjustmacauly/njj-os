-- ============================================================
-- mark_order_paid() — atomic payment for non-B2B orders.
-- B2B orders go through bills (mark_bill_paid). This handles
-- Retail / Event / Online orders that get paid directly.
-- ============================================================
create or replace function public.mark_order_paid(
  p_order_id     uuid,
  p_account_code text,
  p_amount       numeric default null,
  p_paid_date    date    default current_date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   record;
  v_amount  numeric;
  v_entry   uuid;
begin
  if current_user_role() not in ('admin','manager','ops') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id using errcode = '23503';
  end if;

  if v_order.payment_status = 'Paid' then
    -- Idempotent: already paid, no-op
    return null;
  end if;

  if v_order.channel = 'B2B' then
    raise exception 'B2B orders are paid via bills — use mark_bill_paid' using errcode = '22023';
  end if;

  v_amount := coalesce(p_amount, v_order.total);
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  v_entry := public.ledger_apply(
    p_account_code    := p_account_code,
    p_direction       := 'in',
    p_amount          := v_amount,
    p_ref_type        := 'order',
    p_ref_id          := v_order.id,
    p_ref_external_id := v_order.external_id,
    p_description     := 'Order ' || v_order.external_id || ' paid',
    p_idempotency_key := 'order-paid-' || v_order.id::text,
    p_occurred_at     := p_paid_date::timestamptz
  );

  update public.orders
    set payment_status = 'Paid'
    where id = p_order_id;

  return v_entry;
end;
$$;

comment on function public.mark_order_paid is
  'Atomic: marks a non-B2B order paid + posts ledger entry. B2B orders go through mark_bill_paid instead.';

revoke all on function public.mark_order_paid(uuid, text, numeric, date) from public;
grant  execute on function public.mark_order_paid(uuid, text, numeric, date) to authenticated;
