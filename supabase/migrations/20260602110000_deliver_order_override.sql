-- Allow owner/partner to close out OLD orders against batches that are already
-- depleted (e.g. May orders fulfilled from now-empty April batches).
--
-- The previous deliver_order() hard-rejected any allocation drawing more than a
-- batch's remaining stock. For historical backfill that's a dead end: the batch
-- you actually shipped from shows 0 left, so the order can never be marked
-- delivered. This adds an explicit p_allow_override flag — owner/partner only —
-- that skips the remaining-stock guard so the order can be closed and attributed
-- to the correct batch (remaining_signed may go negative, which is the truth).
--
-- Everything else (validation, allocation insert, FIFO fallback, receivable
-- trigger) is unchanged from migration 20260525100000.

-- Drop the old 2-arg signature first: the new function adds a defaulted 3rd
-- arg, so a 2-arg call would be ambiguous between the two overloads otherwise.
drop function if exists public.deliver_order(uuid, jsonb);

create or replace function public.deliver_order(
  p_order_id      uuid,
  p_allocations   jsonb default '[]'::jsonb,
  p_allow_override boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role          app_role;
  v_order         record;
  v_item          record;
  v_alloc         jsonb;
  v_order_item_id uuid;
  v_batch_id      uuid;
  v_qty           integer;
  v_batch         record;
  v_remaining     integer;
  v_primary_batch uuid;
  v_override      boolean;
begin
  v_role := current_user_role();
  if v_role not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to deliver orders' using errcode = '42501';
  end if;

  -- Override is owner/partner only — managers still get the stock guardrails.
  v_override := coalesce(p_allow_override, false) and v_role in ('owner','partner');

  select * into v_order from public.orders
   where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'order not found' using errcode = '23503';
  end if;
  if v_order.fulfillment_status = 'Delivered' then
    raise exception 'order is already delivered' using errcode = '22023';
  end if;

  -- ---- Path A: explicit allocations
  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_order_item_id := (v_alloc->>'order_item_id')::uuid;
      v_batch_id      := (v_alloc->>'batch_id')::uuid;
      v_qty           := (v_alloc->>'qty')::integer;

      if v_order_item_id is null or v_batch_id is null or v_qty is null or v_qty <= 0 then
        raise exception 'invalid allocation: %', v_alloc using errcode = '22023';
      end if;

      select * into v_item from public.order_items
       where id = v_order_item_id and order_id = p_order_id;
      if not found then
        raise exception 'order_item % is not part of order %', v_order_item_id, p_order_id
          using errcode = '23503';
      end if;

      select b.id, b.sku_code, b.status, b.deleted_at,
             (b.units_produced - coalesce(
                (select sum(oi.qty) from public.order_items oi where oi.batch_id = b.id and not exists (
                   select 1 from public.order_item_batch_allocations a where a.order_item_id = oi.id
                 )), 0)
              - coalesce(
                (select sum(a.qty) from public.order_item_batch_allocations a where a.batch_id = b.id), 0)
              - coalesce(
                (select sum(pi.qty) from public.pos_transaction_items pi
                  where pi.batch_id = b.id and pi.item_type = 'juice'::pos_item_type), 0)
              - coalesce(
                (select sum(di.qty) from public.deduction_items di where di.batch_id = b.id), 0)
             )::integer as remaining
        into v_batch
        from public.batches b
       where b.id = v_batch_id;

      if not found then
        raise exception 'batch % not found', v_batch_id using errcode = '23503';
      end if;
      if v_batch.deleted_at is not null then
        raise exception 'batch % is deleted', v_batch_id using errcode = '22023';
      end if;
      if v_batch.status <> 'finalized' then
        raise exception 'batch % is not finalized (status = %)', v_batch_id, v_batch.status
          using errcode = '22023';
      end if;
      if v_batch.sku_code <> v_item.sku_code then
        raise exception 'batch % is for SKU %, order item is %',
          v_batch_id, v_batch.sku_code, v_item.sku_code using errcode = '22023';
      end if;
      -- Stock guard: skipped when an owner/partner explicitly overrides (backfill).
      if v_batch.remaining < v_qty and not v_override then
        raise exception 'batch % only has % units left, cannot draw % (use override to backfill)',
          v_batch_id, v_batch.remaining, v_qty using errcode = '22023';
      end if;

      insert into public.order_item_batch_allocations (
        order_item_id, batch_id, qty, allocated_by_user_id
      ) values (
        v_order_item_id, v_batch_id, v_qty, auth.uid()
      ) on conflict (order_item_id, batch_id) do update
         set qty = excluded.qty;
    end loop;

    -- Validate sum(allocations.qty) per order_item equals order_items.qty.
    for v_item in
      select oi.id, oi.qty, oi.sku_code,
             coalesce(sum(a.qty), 0) as alloc_total
        from public.order_items oi
        left join public.order_item_batch_allocations a on a.order_item_id = oi.id
       where oi.order_id = p_order_id
       group by oi.id, oi.qty, oi.sku_code
    loop
      if v_item.alloc_total <> v_item.qty then
        raise exception 'order_item % (% × %): allocated %, expected %',
          v_item.id, v_item.qty, v_item.sku_code, v_item.alloc_total, v_item.qty
          using errcode = '22023';
      end if;
    end loop;

  else
    -- ---- Path B: FIFO allocation (no explicit allocations passed)
    for v_item in select * from public.order_items where order_id = p_order_id loop
      v_remaining := v_item.qty;
      for v_batch in
        select b.id,
               (b.units_produced - coalesce(
                  (select sum(oi.qty) from public.order_items oi where oi.batch_id = b.id and not exists (
                     select 1 from public.order_item_batch_allocations a where a.order_item_id = oi.id
                   )), 0)
                - coalesce(
                  (select sum(a.qty) from public.order_item_batch_allocations a where a.batch_id = b.id), 0)
                - coalesce(
                  (select sum(pi.qty) from public.pos_transaction_items pi
                    where pi.batch_id = b.id and pi.item_type = 'juice'::pos_item_type), 0)
                - coalesce(
                  (select sum(di.qty) from public.deduction_items di where di.batch_id = b.id), 0)
               )::integer as remaining
          from public.batches b
         where b.sku_code = v_item.sku_code
           and b.status = 'finalized'
           and b.deleted_at is null
         order by b.batch_date asc, b.created_at asc
      loop
        exit when v_remaining <= 0;
        if v_batch.remaining <= 0 then continue; end if;

        v_qty := least(v_remaining, v_batch.remaining);
        insert into public.order_item_batch_allocations (
          order_item_id, batch_id, qty, allocated_by_user_id
        ) values (
          v_item.id, v_batch.id, v_qty, auth.uid()
        ) on conflict (order_item_id, batch_id) do update
           set qty = excluded.qty;
        v_remaining := v_remaining - v_qty;
      end loop;

      if v_remaining > 0 then
        raise exception 'not enough % stock to fulfill order_item % (% short)',
          v_item.sku_code, v_item.id, v_remaining using errcode = '22023';
      end if;
    end loop;
  end if;

  -- Backward-compat: set order_items.batch_id to the largest allocation per item.
  for v_item in select id from public.order_items where order_id = p_order_id loop
    select batch_id into v_primary_batch
      from public.order_item_batch_allocations
     where order_item_id = v_item.id
     order by qty desc
     limit 1;
    update public.order_items
       set batch_id = v_primary_batch
     where id = v_item.id;
  end loop;

  update public.orders
     set fulfillment_status = 'Delivered',
         updated_at         = now()
   where id = p_order_id;

  return p_order_id;
end; $$;

revoke all on function public.deliver_order(uuid, jsonb, boolean) from public;
grant execute on function public.deliver_order(uuid, jsonb, boolean) to authenticated;
