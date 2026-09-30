-- Timesheet basis is INTERNAL only (owner Team profile), never on the shared
-- payslip. Revert get_payslip to not return the day-by-day breakdown.
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
    'advance_repayment', pi.advance_repayment,
    'net_amount', pi.net_amount
  ) into v
  from public.payroll_items pi
  join public.payroll_runs pr on pr.id = pi.run_id
  left join public.accounts ac on ac.code = pi.account_code
  where pi.share_token = p_token and pr.status = 'approved';
  return v;
end; $function$;
