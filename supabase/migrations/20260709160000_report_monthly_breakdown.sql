-- =================================================================
-- Monthly BREAKDOWN report (Phase 3): where money goes / comes from.
--   flow 'out' → spend grouped by category (expense/payment category,
--                supply_receipt = 'Inventory / Supplies')
--   flow 'in'  → income grouped by source (order / pos / receivable /
--                bill / other revenue / refunds)
-- Bucketed by occurred_at month. Internal transfers excluded. The page
-- pivots these rows into month-by-month category/source tables.
-- Owner/partner only.
-- =================================================================

create or replace function public.report_monthly_breakdown()
returns table (month date, flow text, category text, amount numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to view financial reports' using errcode = '42501';
  end if;

  return query
  -- money out, by category
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
  where le.direction = 'out' and le.ref_type is distinct from 'transfer'
  group by 1, 3

  union all

  -- money in, by source. 'revenue' entries split by their revenue_category
  -- (so CSM / TBM income lines up with CSM / TBM spend for comparison).
  select date_trunc('month', le.occurred_at)::date,
         'in'::text,
         case le.ref_type
           when 'order'      then 'Orders (retail/online/event)'
           when 'pos_shift'  then 'Event POS'
           when 'receivable' then 'B2B receivables'
           when 'bill'       then 'B2B bills'
           when 'reversal'   then 'Refunds / reversals'
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
  where le.direction = 'in' and le.ref_type is distinct from 'transfer'
  group by 1, 3;
end; $function$;

revoke all on function public.report_monthly_breakdown() from public;
grant execute on function public.report_monthly_breakdown() to authenticated;
