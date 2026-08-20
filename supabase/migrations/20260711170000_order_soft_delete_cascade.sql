-- =================================================================
-- Soft-deleting an order now cascades: finished-can stock is returned and
-- the order's unbilled receivables are cancelled. Guards against deleting an
-- order whose receivable is already on a bill or has recorded payments.
-- (Applied to prod 2026-08-20 via MCP; this file keeps the repo in sync.)
-- =================================================================

-- 1) Finished-can stock view ignores allocations belonging to soft-deleted
--    orders (both the legacy order_items.batch_id path and the allocation
--    path). A deleted order no longer consumes cans.
create or replace view public.inventory_summary as
 WITH order_use AS (
         SELECT oi.batch_id,
            sum(oi.qty) AS qty
           FROM order_items oi
             JOIN orders o ON o.id = oi.order_id AND o.deleted_at IS NULL
          WHERE oi.batch_id IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM order_item_batch_allocations a
                  WHERE a.order_item_id = oi.id))
          GROUP BY oi.batch_id
        UNION ALL
         SELECT a.batch_id,
            sum(a.qty) AS qty
           FROM order_item_batch_allocations a
             JOIN order_items oi2 ON oi2.id = a.order_item_id
             JOIN orders o ON o.id = oi2.order_id AND o.deleted_at IS NULL
          GROUP BY a.batch_id
        ), order_use_agg AS (
         SELECT order_use.batch_id,
            sum(order_use.qty)::bigint AS qty
           FROM order_use
          GROUP BY order_use.batch_id
        ), pos_use AS (
         SELECT pos_transaction_items.batch_id,
            sum(pos_transaction_items.qty) AS qty
           FROM pos_transaction_items
          WHERE pos_transaction_items.batch_id IS NOT NULL AND pos_transaction_items.item_type = 'juice'::pos_item_type
          GROUP BY pos_transaction_items.batch_id
        ), deduction_use AS (
         SELECT deduction_items.batch_id,
            sum(deduction_items.qty) AS qty
           FROM deduction_items
          WHERE deduction_items.batch_id IS NOT NULL
          GROUP BY deduction_items.batch_id
        )
 SELECT b.id AS batch_id,
    b.external_id AS batch_external_id,
    b.batch_date,
    b.sku_code,
    b.units_produced,
    COALESCE(o.qty, 0::bigint) AS sold_via_orders,
    COALESCE(p.qty, 0::bigint) AS sold_via_pos,
    COALESCE(d.qty, 0::bigint) AS deducted,
    GREATEST(b.units_produced - COALESCE(o.qty, 0::bigint) - COALESCE(p.qty, 0::bigint) - COALESCE(d.qty, 0::bigint), 0::bigint) AS remaining,
    b.units_produced - COALESCE(o.qty, 0::bigint) - COALESCE(p.qty, 0::bigint) - COALESCE(d.qty, 0::bigint) AS remaining_signed,
    b.cogs_total,
    b.qc_passed,
    b.deleted_at
   FROM batches b
     LEFT JOIN order_use_agg o ON o.batch_id = b.id
     LEFT JOIN pos_use p ON p.batch_id = b.id
     LEFT JOIN deduction_use d ON d.batch_id = b.id
  WHERE b.deleted_at IS NULL AND b.status = 'finalized'::batch_status;

-- 2) Cascade trigger: when an order is soft-deleted, cancel its unbilled
--    receivables. Refuse the delete if a receivable is already on a bill or
--    the order has recorded payments — those must be unwound first.
create or replace function public.cascade_order_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billed int;
  v_ledger int;
begin
  -- Block if any live receivable is already billed or paid.
  select count(*) into v_billed
  from public.receivables r
  where r.order_id = new.id
    and r.deleted_at is null
    and r.status in ('billed','paid');
  if v_billed > 0 then
    raise exception 'Cannot delete this order: its receivable is already on a bill or paid. Remove it from the bill (or refund) first.'
      using errcode = '22023';
  end if;

  -- Block if payments (ledger entries) are posted against the order.
  select count(*) into v_ledger
  from public.ledger_entries
  where ref_type = 'order' and ref_id = new.id;
  if v_ledger > 0 then
    raise exception 'Cannot delete this order: it has recorded payments. Refund/void the payment first.'
      using errcode = '22023';
  end if;

  -- Cancel the order's remaining (pending, unbilled) receivables.
  update public.receivables
     set status = 'cancelled', deleted_at = now()
   where order_id = new.id and deleted_at is null;

  return new;
end; $$;

drop trigger if exists trg_cascade_order_soft_delete on public.orders;
create trigger trg_cascade_order_soft_delete
  after update of deleted_at on public.orders
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.cascade_order_soft_delete();
