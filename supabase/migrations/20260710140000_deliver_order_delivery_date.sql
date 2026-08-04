-- Capture the ACTUAL delivery date when an order is delivered.
--
-- The existing deliver_order(uuid, jsonb, boolean) allocates stock and flips
-- fulfilment to Delivered but never touches orders.delivery_date, so the order
-- kept whatever (planned) date it was created with. This adds a 4-arg overload
-- that takes the real delivery date (required — no default, so it can never
-- collide with the 3-arg version) and records it on the order.
create or replace function public.deliver_order(
  p_order_id       uuid,
  p_allocations    jsonb,
  p_allow_override boolean,
  p_delivery_date  date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Reuse the existing, tested delivery logic (role checks, allocations,
  -- stock validation, marks Delivered).
  perform public.deliver_order(p_order_id, p_allocations, p_allow_override);
  -- Record when it was actually delivered.
  update public.orders
     set delivery_date = p_delivery_date,
         updated_at    = now()
   where id = p_order_id and deleted_at is null;
  return p_order_id;
end; $function$;

revoke all on function public.deliver_order(uuid, jsonb, boolean, date) from public;
grant execute on function public.deliver_order(uuid, jsonb, boolean, date) to authenticated;
