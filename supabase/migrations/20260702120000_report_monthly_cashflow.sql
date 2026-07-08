-- =================================================================
-- Monthly cash-flow report (Phase 1 of the Reports page).
--
-- Aggregates ledger_entries by calendar month (occurred_at — the economic
-- date, so back-dated entries land in the right month) and classifies each
-- flow into meaningful buckets:
--
--   IN  : sales        = order / pos_shift / receivable / revenue / bill
--         refunds      = reversal (cash returned to us)
--         other_income = any other 'in'
--   OUT : opex         = expense / payment
--         inventory    = supply_receipt (ingredient purchases)
--         other_out    = any other 'out'
--
-- Internal transfers (ref_type 'transfer') are excluded from cash in/out so
-- moving money between our own accounts doesn't look like income/spend.
--
-- SECURITY DEFINER + role gate: finance figures are owner/partner only,
-- matching the rest of the Finance section.
-- =================================================================

create or replace function public.report_monthly_cashflow()
returns table (
  month        date,
  cash_in      numeric,
  cash_out     numeric,
  net          numeric,
  sales        numeric,
  refunds      numeric,
  other_income numeric,
  opex         numeric,
  inventory    numeric,
  other_out    numeric
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
  select
    date_trunc('month', le.occurred_at)::date as month,
    coalesce(sum(le.amount) filter (where le.direction = 'in'  and le.ref_type is distinct from 'transfer'), 0) as cash_in,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type is distinct from 'transfer'), 0) as cash_out,
    coalesce(sum(le.amount) filter (where le.direction = 'in'  and le.ref_type is distinct from 'transfer'), 0)
      - coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type is distinct from 'transfer'), 0) as net,
    coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type in ('order','pos_shift','receivable','revenue','bill')), 0) as sales,
    coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type = 'reversal'), 0) as refunds,
    coalesce(sum(le.amount) filter (where le.direction = 'in' and le.ref_type not in ('order','pos_shift','receivable','revenue','bill','reversal','transfer')), 0) as other_income,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type in ('expense','payment')), 0) as opex,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type = 'supply_receipt'), 0) as inventory,
    coalesce(sum(le.amount) filter (where le.direction = 'out' and le.ref_type not in ('expense','payment','supply_receipt','transfer')), 0) as other_out
  from public.ledger_entries le
  group by date_trunc('month', le.occurred_at)
  order by 1;
end; $function$;

revoke all on function public.report_monthly_cashflow() from public;
grant execute on function public.report_monthly_cashflow() to authenticated;
