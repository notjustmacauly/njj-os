-- Standard payslip: structured earnings (base/overtime/bonuses → gross) and
-- deductions (tax/philhealth/sss/pagibig/absences/other → total), net = gross −
-- deductions. The single signed `adjustment` is folded into bonuses/other.
-- Day breakdown stays as the internal timesheet, not shown on the payslip.
-- Applied to prod 2026-09-21 via MCP.
alter table public.payroll_items
  add column if not exists overtime_pay numeric not null default 0,
  add column if not exists bonuses numeric not null default 0,
  add column if not exists tax numeric not null default 0,
  add column if not exists philhealth numeric not null default 0,
  add column if not exists sss numeric not null default 0,
  add column if not exists pagibig numeric not null default 0,
  add column if not exists absences numeric not null default 0,
  add column if not exists other_deductions numeric not null default 0;

update public.payroll_items
  set bonuses = bonuses + greatest(coalesce(adjustment,0), 0),
      other_deductions = other_deductions + greatest(-coalesce(adjustment,0), 0)
  where coalesce(adjustment,0) <> 0;

alter table public.payroll_items drop column net_amount;
alter table public.payroll_items add column net_amount numeric generated always as (
  base_amount + overtime_pay + bonuses
  - (tax + philhealth + sss + pagibig + absences + other_deductions)
) stored;

create or replace function public.set_payroll_pay_details(
  p_item_id uuid, p_overtime numeric, p_bonuses numeric,
  p_tax numeric, p_philhealth numeric, p_sss numeric, p_pagibig numeric, p_absences numeric, p_other numeric
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.id, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then raise exception 'line not found' using errcode='23503'; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  update public.payroll_items set
      overtime_pay = greatest(coalesce(p_overtime,0), 0),
      bonuses = greatest(coalesce(p_bonuses,0), 0),
      tax = greatest(coalesce(p_tax,0), 0),
      philhealth = greatest(coalesce(p_philhealth,0), 0),
      sss = greatest(coalesce(p_sss,0), 0),
      pagibig = greatest(coalesce(p_pagibig,0), 0),
      absences = greatest(coalesce(p_absences,0), 0),
      other_deductions = greatest(coalesce(p_other,0), 0),
      updated_at = now()
   where id = p_item_id;
end; $function$;
revoke all on function public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;

create or replace function public.get_payslip(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'run', jsonb_build_object('label', pr.label, 'period_start', pr.period_start, 'period_end', pr.period_end,
                              'pay_date', pr.pay_date, 'status', pr.status),
    'name', pi.name, 'pay_type', pi.pay_type, 'hours', pi.hours,
    'account_code', pi.account_code, 'account_name', ac.name,
    'base_amount', pi.base_amount, 'overtime_pay', pi.overtime_pay, 'bonuses', pi.bonuses,
    'tax', pi.tax, 'philhealth', pi.philhealth, 'sss', pi.sss, 'pagibig', pi.pagibig,
    'absences', pi.absences, 'other_deductions', pi.other_deductions,
    'net_amount', pi.net_amount
  ) into v
  from public.payroll_items pi
  join public.payroll_runs pr on pr.id = pi.run_id
  left join public.accounts ac on ac.code = pi.account_code
  where pi.share_token = p_token and pr.status = 'approved';
  return v;
end; $function$;
