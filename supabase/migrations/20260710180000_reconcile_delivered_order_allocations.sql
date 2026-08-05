-- Keep batch allocations in step when a DELIVERED order's items are edited.
--
-- Deleting a line already returns its cans (FK cascade). But changing a line's
-- quantity (or SKU) on an already-delivered order left the original allocation
-- untouched, so inventory stayed consumed for cans that were never delivered
-- (this is what happened to Fitness Nation: 45 allocated, 18 delivered).
--
-- This trigger reconciles a delivered order-item's allocations to match its
-- current quantity: drop allocations left on the wrong SKU, trim the excess,
-- or draw the shortfall FIFO from finalized batches (falling back to the item's
-- chosen / oldest batch if stock is short, mirroring an override delivery).
--
-- It does NOT touch order_items, so it can't recurse, and it only acts on
-- Delivered orders — during deliver_order the order is still Pending when its
-- items are written, so normal delivery is unaffected.
create or replace function public.reconcile_delivered_order_item_allocations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   text;
  v_target   int;
  v_alloc    int;
  v_excess   int;
  v_short    int;
  v_take     int;
  v_fallback uuid;
  r          record;
begin
  select fulfillment_status into v_status from public.orders where id = NEW.order_id;
  if v_status is distinct from 'Delivered' then
    return NEW;
  end if;

  v_target := NEW.qty;

  -- SKU swap: drop allocations that point at a batch of a different SKU.
  delete from public.order_item_batch_allocations a
   using public.batches b
   where a.order_item_id = NEW.id
     and b.id = a.batch_id
     and b.sku_code is distinct from NEW.sku_code;

  select coalesce(sum(qty), 0) into v_alloc
    from public.order_item_batch_allocations
   where order_item_id = NEW.id;

  if v_alloc = v_target then
    return NEW;

  elsif v_alloc > v_target then
    -- Trim the excess (largest allocations first) back to the delivered qty.
    v_excess := v_alloc - v_target;
    for r in
      select id, qty from public.order_item_batch_allocations
       where order_item_id = NEW.id order by qty desc, batch_id
    loop
      exit when v_excess <= 0;
      if r.qty <= v_excess then
        delete from public.order_item_batch_allocations where id = r.id;
        v_excess := v_excess - r.qty;
      else
        update public.order_item_batch_allocations set qty = qty - v_excess where id = r.id;
        v_excess := 0;
      end if;
    end loop;

  else
    -- Draw the shortfall FIFO from finalized batches with stock.
    v_short := v_target - v_alloc;
    for r in
      select b.id,
        (b.units_produced
          - coalesce((select sum(oi.qty) from public.order_items oi
                       where oi.batch_id = b.id
                         and not exists (select 1 from public.order_item_batch_allocations aa
                                          where aa.order_item_id = oi.id)), 0)
          - coalesce((select sum(a.qty) from public.order_item_batch_allocations a
                       where a.batch_id = b.id), 0)
          - coalesce((select sum(pi.qty) from public.pos_transaction_items pi
                       where pi.batch_id = b.id and pi.item_type = 'juice'::public.pos_item_type), 0)
          - coalesce((select sum(di.qty) from public.deduction_items di
                       where di.batch_id = b.id), 0)
        )::int as remaining
      from public.batches b
      where b.sku_code = NEW.sku_code and b.status = 'finalized' and b.deleted_at is null
      order by b.batch_date asc, b.created_at asc
    loop
      exit when v_short <= 0;
      if r.remaining <= 0 then continue; end if;
      v_take := least(v_short, r.remaining);
      insert into public.order_item_batch_allocations (order_item_id, batch_id, qty, allocated_by_user_id)
        values (NEW.id, r.id, v_take, auth.uid())
      on conflict (order_item_id, batch_id)
        do update set qty = public.order_item_batch_allocations.qty + excluded.qty;
      v_short := v_short - v_take;
    end loop;

    -- Still short (no stock): put the remainder on the item's chosen batch, else
    -- the oldest finalized batch of the SKU (may go negative, like an override).
    if v_short > 0 then
      v_fallback := NEW.batch_id;
      if v_fallback is null then
        select b.id into v_fallback from public.batches b
         where b.sku_code = NEW.sku_code and b.status = 'finalized' and b.deleted_at is null
         order by b.batch_date asc, b.created_at asc limit 1;
      end if;
      if v_fallback is not null then
        insert into public.order_item_batch_allocations (order_item_id, batch_id, qty, allocated_by_user_id)
          values (NEW.id, v_fallback, v_short, auth.uid())
        on conflict (order_item_id, batch_id)
          do update set qty = public.order_item_batch_allocations.qty + excluded.qty;
      end if;
    end if;
  end if;

  return NEW;
end; $function$;

drop trigger if exists order_items_reconcile_allocations on public.order_items;
create trigger order_items_reconcile_allocations
  after insert or update on public.order_items
  for each row execute function public.reconcile_delivered_order_item_allocations();
