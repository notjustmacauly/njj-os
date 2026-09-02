-- Income breakdown ("Where money came from"): split NotJustJuice sales into
-- channels — Juice · Wholesale (B2B) / Online / Retail / POS / Events — so the
-- report shows juice revenue by channel alongside CSM / TBM / Sponsorship /
-- Events / Catering / etc. Keeps the voided-item exclusions.
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
           when 'order' then
             case o.channel::text
               when 'Online' then 'Juice · Online'
               when 'Retail' then 'Juice · Retail'
               when 'Event'  then 'Juice · Events'
               when 'B2B'    then 'Juice · Wholesale (B2B)'
               else 'Juice · Orders'
             end
           when 'pos_shift'  then 'Juice · POS'
           when 'receivable' then 'Juice · Wholesale (B2B)'
           when 'bill'       then 'Juice · Wholesale (B2B)'
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
  left join public.orders o           on le.ref_type = 'order'   and o.id  = le.ref_id
  where le.direction = 'in'
    and le.ref_type not in ('transfer','reversal')
    and (le.ref_type <> 'revenue' or re.voided_at is null)
  group by 1, 3;
end; $function$;
