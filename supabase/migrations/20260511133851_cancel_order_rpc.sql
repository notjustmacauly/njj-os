-- Soft-delete an order. Admin/manager only. Refuses orders that already
-- have ledger entries posted against them (i.e. payments received) — those
-- must go through the Finance refund flow (built later).

create or replace function public.cancel_order(
  p_order_id        uuid,
  p_reason          text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        record;
  v_ledger_count int;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'insufficient privileges to cancel orders' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '23503';
  end if;

  if v_order.deleted_at is not null then
    -- Idempotent: already cancelled, no-op
    return jsonb_build_object('order_id', p_order_id, 'already_cancelled', true);
  end if;

  -- Refuse if there are ledger entries (payments) tied to this order.
  -- Those need to be refunded first via the Finance module.
  select count(*) into v_ledger_count
  from public.ledger_entries
  where ref_type = 'order' and ref_id = p_order_id;

  if v_ledger_count > 0 then
    raise exception
      'order has % ledger entries — refund the payment(s) via Finance before cancelling',
      v_ledger_count
      using errcode = '22023';
  end if;

  update public.orders
     set deleted_at = now(),
         notes      = case
                        when p_reason is null or p_reason = '' then notes
                        else coalesce(notes || E'\n', '') || 'Cancelled: ' || p_reason
                      end
   where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'cancelled_at', now()
  );
end; $$;

revoke all on function public.cancel_order(uuid, text, text) from public;
grant execute on function public.cancel_order(uuid, text, text) to authenticated;
