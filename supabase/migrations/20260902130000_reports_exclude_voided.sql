-- Voided revenue / voided expenses / cancelled payments now disappear from
-- reports entirely (previously a voided revenue showed as a cost "Revenue_void"
-- and voided expenses showed as "Refunds / reversals" income). We exclude the
-- void/reversal ledger entries AND their now-voided originals so corrected
-- items net out completely. Ledger entries themselves are untouched (balances
-- stay correct); only the report categorisation changes.
-- (Applied to prod 2026-09-02 via MCP; file keeps repo in sync.)

create or replace function public.report_monthly_breakdown()
 returns table(month date, flow text, category text, amount numeric)
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to view financial reports' using errcode = '42501';
  end if;

  return query
  select date_trunc('month', le.occurred_at)::date as month,
         'out'::text as flow,
         coalesce(case le.ref_type
                    when 'expense'        then e.category
                    when 'payment'        then pay.category
                    when 'supply_receipt' then 'Inventory / Supplies'
                    else initcap(le.ref_type)
                  end, 'Uncategorized') as category,
         sum(le.amount)::numeric as amount
  from public.ledger_entries le
  left join public.expenses e   on le.ref_type = 'expense' and e.id  = le.ref_id
  left join public.payments pay on le.ref_type = 'payment' and pay.id = le.ref_id
  where le.direction = 'out'
    and le.ref_type not in ('transfer','revenue_void')
    and (le.ref_type <> 'expense' or e.voided_at is null)
    and (le.ref_type <> 'payment' or pay.cancelled_at is null)
  group by 1, 3

  union all

  select date_trunc('month', le.occurred_at)::date,
         'in'::text,
         case le.ref_type
           when 'order'      then 'Orders (retail/online/event)'
           when 'pos_shift'  then 'Event POS'
           when 'receivable' then 'B2B receivables'
           when 'bill'       then 'B2B bills'
           when 'revenue'    then coalesce(case re.category::text
                                             when 'csm'               then 'CSM'
                                             when 'tbm'               then 'TBM'
                                             when 'catering_contract' then 'Catering / contracts'
                                             when 'event'             then 'Events'
                                             when 'sponsorship'       then 'Sponsorship'
                                             when 'rent'              then 'Rent'
                                             else 'Other income'
                                           end, 'Other income')
           else initcap(le.ref_type)
         end,
         sum(le.amount)::numeric
  from public.ledger_entries le
  left join public.revenue_entries re on le.ref_type = 'revenue' and re.id = le.ref_id
  where le.direction = 'in'
    and le.ref_type not in ('transfer','reversal')
    and (le.ref_type <> 'revenue' or re.voided_at is null)
  group by 1, 3;
end; $function$;

create or replace function public.report_monthly_cashflow()
 returns table(month date, cash_in numeric, cash_out numeric, net numeric, sales numeric, refunds numeric, other_income numeric, opex numeric, inventory numeric, other_out numeric)
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to view financial reports' using errcode = '42501';
  end if;

  return query
  with le as (
    select l.*
    from public.ledger_entries l
    left join public.revenue_entries re on l.ref_type = 'revenue' and re.id = l.ref_id
    left join public.expenses e         on l.ref_type = 'expense' and e.id  = l.ref_id
    left join public.payments pay       on l.ref_type = 'payment' and pay.id = l.ref_id
    where l.ref_type not in ('revenue_void','reversal')
      and (l.ref_type <> 'revenue' or re.voided_at is null)
      and (l.ref_type <> 'expense' or e.voided_at is null)
      and (l.ref_type <> 'payment' or pay.cancelled_at is null)
  )
  select
    date_trunc('month', le.occurred_at)::date as month,
    coalesce(sum(le.amount) filter (where le.direction = 'in'  and le.ref_type is distinct from 'transfer'), 0) as cash_in,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type is distinct from 'transfer'), 0) as cash_out,
    coalesce(sum(le.amount) filter (where le.direction = 'in'  and le.ref_type is distinct from 'transfer'), 0)
      - coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type is distinct from 'transfer'), 0) as net,
    coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type in ('order','pos_shift','receivable','revenue','bill')), 0) as sales,
    0::numeric as refunds,
    coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type not in ('order','pos_shift','receivable','revenue','bill','transfer')), 0) as other_income,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type in ('expense','payment')), 0) as opex,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type = 'supply_receipt'), 0) as inventory,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type not in ('expense','payment','supply_receipt','transfer')), 0) as other_out
  from le
  group by 1
  order by 1;
end; $function$;

create or replace function public.report_monthly_profit()
 returns table(month date, revenue numeric, cogs numeric, gross_profit numeric, opex numeric, operating_profit numeric)
 language plpgsql security definer set search_path to 'public'
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
           coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type in ('expense','payment')), 0) as opex
    from public.ledger_entries le
    left join public.expenses e   on le.ref_type = 'expense' and e.id  = le.ref_id
    left join public.payments pay on le.ref_type = 'payment' and pay.id = le.ref_id
    where (le.ref_type <> 'expense' or e.voided_at is null)
      and (le.ref_type <> 'payment' or pay.cancelled_at is null)
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
