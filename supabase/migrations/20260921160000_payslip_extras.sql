-- Payslip extras: sent mark, per-line displayed-period override, and
-- self-service payslips for the logged-in employee. Applied to prod 2026-09-21.
alter table public.payroll_items
  add column if not exists payslip_emailed_at timestamptz,
  add column if not exists payslip_period_start date,
  add column if not exists payslip_period_end date;

create or replace function public.set_payslip_period(p_item_id uuid, p_start date, p_end date)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payslip dates' using errcode='42501'; end if;
  update public.payroll_items
     set payslip_period_start = p_start, payslip_period_end = p_end, updated_at = now()
   where id = p_item_id;
end; $function$;
revoke all on function public.set_payslip_period(uuid,date,date) from public, anon;
grant execute on function public.set_payslip_period(uuid,date,date) to authenticated, service_role;

create or replace function public.my_payslips()
returns table(token uuid, label text, period_start date, period_end date, pay_date date, net_amount numeric)
language sql stable security definer set search_path to 'public' as $function$
  select pi.share_token, pr.label,
    coalesce(pi.payslip_period_start, pr.period_start),
    coalesce(pi.payslip_period_end, pr.period_end),
    pr.pay_date, pi.net_amount
  from public.payroll_items pi
  join public.payroll_runs pr on pr.id = pi.run_id
  where pr.status = 'approved' and pi.user_id = auth.uid()
  order by pr.pay_date desc;
$function$;
revoke all on function public.my_payslips() from public, anon;
grant execute on function public.my_payslips() to authenticated, service_role;

create or replace function public.get_payslip(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'run', jsonb_build_object('label', pr.label,
      'period_start', coalesce(pi.payslip_period_start, pr.period_start),
      'period_end', coalesce(pi.payslip_period_end, pr.period_end),
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

-- One-off: Snow's Sep 1–12 payslip actually covers through the 17th.
update public.payroll_items set payslip_period_end = '2026-09-17'
  where share_token = 'b705f211-27bf-424a-8f65-b091c391b02b';
