-- =================================================================
-- Order multi-batch delivery.
--
-- Today: order_items.batch_id is a single uuid — one order line, one
-- batch. In reality we often deliver an order by pulling cans from
-- multiple batches (e.g. an order for 24 PCL might pull 16 from
-- batch-A and 8 from batch-B because A is running out).
--
-- This migration adds:
--   - order_item_batch_allocations table (the new source of truth)
--   - deliver_order(p_order_id, p_allocations jsonb) RPC
--   - inventory_summary view rewritten to count allocations first,
--     fall back to order_items.batch_id for legacy single-batch rows
--
-- After this migration:
--   - Legacy orders (single batch_id on order_items, no allocation rows)
--     still inventory-account correctly. No backfill needed; the view
--     handles both shapes.
--   - New deliveries created via deliver_order() write allocation rows
--     AND set order_items.batch_id to the primary batch (largest qty)
--     for backward-compat with anything still reading that column.
--
-- DO NOT APPLY ahead of the frontend changes. CC will apply this with
-- the matching UI in the same deploy.
-- =================================================================

-- ---------- 1) Allocations table
create table if not exists public.order_item_batch_allocations (
  id                       uuid primary key default gen_random_uuid(),
  order_item_id            uuid not null references public.order_items(id) on delete cascade,
  batch_id                 uuid not null references public.batches(id),
  qty                      integer not null check (qty > 0),
  cost_per_unit_at_delivery numeric,
  allocated_at             timestamptz not null default now(),
  allocated_by_user_id     uuid references auth.users(id),
  unique (order_item_id, batch_id)
);

comment on table public.order_item_batch_allocations is
  'Multi-batch fulfillment. One order_item can be fulfilled by N batches; sum(qty) for an order_item must equal order_items.qty.';

create index if not exists order_item_batch_allocations_order_item_idx
  on public.order_item_batch_allocations(order_item_id);
create index if not exists order_item_batch_allocations_batch_idx
  on public.order_item_batch_allocations(batch_id);

-- RLS: read = anyone authenticated who can read orders (mirrors order_items).
-- Writes go through the deliver_order RPC, so no insert/update/delete policy.
alter table public.order_item_batch_allocations enable row level security;

drop policy if exists "allocations read" on public.order_item_batch_allocations;
create policy "allocations read" on public.order_item_batch_allocations
  for select to authenticated using (true);

-- ---------- 2) deliver_order RPC
-- Marks an order as Delivered and records per-batch allocations.
-- p_allocations format: jsonb array of objects:
--   [
--     {"order_item_id": "<uuid>", "batch_id": "<uuid>", "qty": 5},
--     {"order_item_id": "<uuid>", "batch_id": "<uuid>", "qty": 3},
--     ...
--   ]
-- If p_allocations is NULL or '[]', the function falls back to FIFO:
-- for each order_item, walks finalized batches in received order until
-- the qty is covered.
create or replace function public.deliver_order(
  p_order_id     uuid,
  p_allocations  jsonb default '[]'::jsonb
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
  v_sum           integer;
  v_primary_batch uuid;
  v_primary_qty   integer;
begin
  v_role := current_user_role();
  if v_role not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to deliver orders' using errcode = '42501';
  end if;

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
    -- Validate each allocation row and insert it.
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_order_item_id := (v_alloc->>'order_item_id')::uuid;
      v_batch_id      := (v_alloc->>'batch_id')::uuid;
      v_qty           := (v_alloc->>'qty')::integer;

      if v_order_item_id is null or v_batch_id is null or v_qty is null or v_qty <= 0 then
        raise exception 'invalid allocation: %', v_alloc using errcode = '22023';
      end if;

      -- order_item belongs to this order
      select * into v_item from public.order_items
       where id = v_order_item_id and order_id = p_order_id;
      if not found then
        raise exception 'order_item % is not part of order %', v_order_item_id, p_order_id
          using errcode = '23503';
      end if;

      -- batch is finalized, not deleted, and same SKU
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
      if v_batch.remaining < v_qty then
        raise exception 'batch % only has % units left, cannot draw %',
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

  -- Backward-compat: set order_items.batch_id to the largest allocation
  -- per item. Anything still reading order_items.batch_id (e.g. an old
  -- report) sees a single representative batch.
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

  -- Mark delivered. The auto_create_receivable_on_delivery trigger fires.
  update public.orders
     set fulfillment_status = 'Delivered',
         updated_at         = now()
   where id = p_order_id;

  return p_order_id;
end; $$;

revoke all on function public.deliver_order(uuid, jsonb) from public;
grant execute on function public.deliver_order(uuid, jsonb) to authenticated;

-- ---------- 3) inventory_summary view: count allocations first
-- New shape:
--   sold_via_orders = sum(allocations.qty for batch)
--                   + sum(order_items.qty for batch where no allocations exist for that item)
-- This keeps legacy single-batch orders accounted for while new
-- multi-batch deliveries use the allocations table.
-- Drop + recreate (cannot CREATE OR REPLACE when column types change).
drop view if exists public.inventory_summary;
create view public.inventory_summary as
 with order_use as (
   -- Legacy: order_items with a batch_id and no allocations
   select oi.batch_id, sum(oi.qty)::bigint as qty
     from public.order_items oi
    where oi.batch_id is not null
      and not exists (
        select 1 from public.order_item_batch_allocations a
         where a.order_item_id = oi.id
      )
    group by oi.batch_id

   union all

   -- New: allocations are source of truth
   select a.batch_id, sum(a.qty)::bigint as qty
     from public.order_item_batch_allocations a
    group by a.batch_id
 ), order_use_agg as (
   select batch_id, sum(qty)::bigint as qty from order_use group by batch_id
 ), pos_use as (
   select pos_transaction_items.batch_id, sum(pos_transaction_items.qty) as qty
     from public.pos_transaction_items
    where pos_transaction_items.batch_id is not null
      and pos_transaction_items.item_type = 'juice'::pos_item_type
    group by pos_transaction_items.batch_id
 ), deduction_use as (
   select deduction_items.batch_id, sum(deduction_items.qty) as qty
     from public.deduction_items
    where deduction_items.batch_id is not null
    group by deduction_items.batch_id
 )
 select b.id as batch_id,
        b.external_id as batch_external_id,
        b.batch_date,
        b.sku_code,
        b.units_produced,
        coalesce(o.qty, 0::bigint) as sold_via_orders,
        coalesce(p.qty, 0::bigint) as sold_via_pos,
        coalesce(d.qty, 0::bigint) as deducted,
        greatest(b.units_produced - coalesce(o.qty, 0::bigint)
                                   - coalesce(p.qty, 0::bigint)
                                   - coalesce(d.qty, 0::bigint), 0::bigint) as remaining,
        b.units_produced - coalesce(o.qty, 0::bigint)
                         - coalesce(p.qty, 0::bigint)
                         - coalesce(d.qty, 0::bigint) as remaining_signed,
        b.cogs_total,
        b.qc_passed,
        b.deleted_at
   from public.batches b
   left join order_use_agg o on o.batch_id = b.id
   left join pos_use       p on p.batch_id = b.id
   left join deduction_use d on d.batch_id = b.id
  where b.deleted_at is null
    and b.status = 'finalized';
