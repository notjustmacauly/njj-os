-- =================================================================
-- Monthly PROFIT report (Phase 2 of the Reports page).
--
-- Juice operating P&L, accrual-style:
--   revenue = value of juice cans SOLD that month (delivered orders + POS),
--             bucketed by the sale/delivery date
--   cogs    = batch cost of those same cans (qty x batch cost-per-can),
--             same sale month  -> revenue & cogs are time-consistent
--   gross_profit = revenue - cogs
--   opex    = operating spend from the ledger (expense + payment), net of
--             refunds (reversal), by occurred_at month
--   operating_profit = gross_profit - opex
--
-- Note: event/ticket & other income are NOT in this juice P&L (they appear
-- in the cash-flow tab). COGS uses recorded batch costs; 14 historical
-- batches were cost-estimated from the real-batch average (2026-07-09).
-- Owner/partner only.
-- =================================================================

create or replace function public.report_monthly_profit()
returns table (
  month            date,
  revenue          numeric,
  cogs             numeric,
  gross_profit     numeric,
  opex             numeric,
  operating_profit numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to view financial reports' using errcode = '42501';
  end if;

  return query
  with sold as (
    select coalesce(o.delivery_date, o.order_date) as sdate, oi.qty, oi.unit_price, oi.batch_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id and o.deleted_at is null
    where o.fulfillment_status = 'Delivered' and oi.batch_id is not null
    union all
    select coalesce(o.delivery_date, o.order_date), a.qty, oi.unit_price, a.batch_id
    from public.order_item_batch_allocations a
    join public.order_items oi on oi.id = a.order_item_id
    join public.orders o on o.id = oi.order_id and o.deleted_at is null
    where o.fulfillment_status = 'Delivered'
    union all
    select pi.created_at::date, pi.qty, pi.unit_price, pi.batch_id
    from public.pos_transaction_items pi
    where pi.item_type = 'juice' and pi.batch_id is not null
  ),
  gp as (
    select date_trunc('month', s.sdate)::date as m,
           sum(s.qty * s.unit_price) as rev,
           sum(s.qty * (b.cogs_total / nullif(b.units_produced, 0))) as cogs
    from sold s
    join public.batches b on b.id = s.batch_id
    group by 1
  ),
  ex as (
    select date_trunc('month', le.occurred_at)::date as m,
           coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type in ('expense','payment')), 0)
             - coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type = 'reversal'), 0) as opex
    from public.ledger_entries le
    group by 1
  )
  select coalesce(gp.m, ex.m) as month,
         coalesce(gp.rev, 0)::numeric as revenue,
         coalesce(gp.cogs, 0)::numeric as cogs,
         (coalesce(gp.rev, 0) - coalesce(gp.cogs, 0))::numeric as gross_profit,
         coalesce(ex.opex, 0)::numeric as opex,
         ((coalesce(gp.rev, 0) - coalesce(gp.cogs, 0)) - coalesce(ex.opex, 0))::numeric as operating_profit
  from gp
  full join ex on gp.m = ex.m
  order by 1;
end; $function$;

revoke all on function public.report_monthly_profit() from public;
grant execute on function public.report_monthly_profit() to authenticated;
