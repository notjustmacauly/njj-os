-- Let the Incentive line be paid from a DIFFERENT account than the salary, or
-- from outside NJJ's books entirely:
--   incentive_account_code = NULL       → same account as salary (default, staff)
--   incentive_account_code = <account>  → incentive posts from that account (e.g. Hanneh: RCBC)
--   incentive_account_code = 'EXTERNAL' → shown on payslip, NOT booked as an NJJ expense (e.g. Chrissia: CSM)
-- The payslip always shows the full total; only the ledger posting splits.
alter table public.payroll_items
  add column if not exists incentive_account_code text;

-- Pay details editor also sets the incentive account (trailing optional param).
drop function if exists public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric);
drop function if exists public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric);
create or replace function public.set_payroll_pay_details(
  p_item_id uuid, p_overtime numeric, p_bonuses numeric,
  p_tax numeric, p_philhealth numeric, p_sss numeric, p_pagibig numeric, p_absences numeric, p_other numeric,
  p_incentive numeric default 0, p_incentive_account text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_inc_acct text;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.id, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then raise exception 'line not found' using errcode='23503'; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  v_inc_acct := nullif(trim(coalesce(p_incentive_account,'')), '');
  if v_inc_acct is not null and v_inc_acct <> 'EXTERNAL'
     and not exists (select 1 from public.accounts where code = v_inc_acct) then
    raise exception 'unknown incentive account %', v_inc_acct using errcode='22023'; end if;
  update public.payroll_items set
      overtime_pay = greatest(coalesce(p_overtime,0), 0),
      bonuses = greatest(coalesce(p_bonuses,0), 0),
      incentive = greatest(coalesce(p_incentive,0), 0),
      incentive_account_code = v_inc_acct,
      tax = greatest(coalesce(p_tax,0), 0),
      philhealth = greatest(coalesce(p_philhealth,0), 0),
      sss = greatest(coalesce(p_sss,0), 0),
      pagibig = greatest(coalesce(p_pagibig,0), 0),
      absences = greatest(coalesce(p_absences,0), 0),
      other_deductions = greatest(coalesce(p_other,0), 0),
      updated_at = now()
   where id = p_item_id;
end; $function$;
revoke all on function public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.set_payroll_pay_details(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated, service_role;

-- Approve: post the salary portion and the incentive portion to their own
-- accounts; skip EXTERNAL incentives (not NJJ money). total_amount = what NJJ posts.
create or replace function public.approve_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record; v_comp numeric; v_posted numeric := 0; v_missing int; r record; v_key text; v_expense uuid; a record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can approve payroll' using errcode='42501'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode='23503'; end if;
  if v_run.status <> 'draft' then raise exception 'run is already processed' using errcode='22023'; end if;

  select coalesce(sum(net_amount),0) into v_comp from public.payroll_items where run_id = p_run_id;
  if v_comp <= 0 then raise exception 'nothing to pay in this run' using errcode='22023'; end if;

  -- A line needs a Pay-from account when its salary portion posts, or when its
  -- incentive posts to that same salary account (incentive_account_code is null).
  select count(*) into v_missing from public.payroll_items
   where run_id = p_run_id and (account_code is null or account_code = '')
     and ((net_amount - incentive) <> 0 or (incentive > 0 and incentive_account_code is null));
  if v_missing > 0 then
    raise exception 'every paid line needs a Pay-from account (% still missing)', v_missing using errcode='22023'; end if;

  -- Build the posting legs: salary portion to the salary account + incentive to
  -- its own account (or the salary account when unset); EXTERNAL incentives drop out.
  for r in
    with legs as (
      select account_code as acct, (net_amount - incentive) as amt
      from public.payroll_items where run_id = p_run_id
      union all
      select case when incentive_account_code is null then account_code else incentive_account_code end as acct, incentive as amt
      from public.payroll_items
      where incentive > 0 and run_id = p_run_id
        and (incentive_account_code is null or incentive_account_code <> 'EXTERNAL')
    )
    select acct, sum(amt) as amt from legs where acct is not null group by acct having sum(amt) > 0
  loop
    if not exists (select 1 from public.accounts where code = r.acct) then
      raise exception 'unknown account %', r.acct using errcode='22023'; end if;
    v_key := gen_random_uuid()::text;
    v_expense := public.create_expense(
      v_key, r.amt, 'Payroll', 'Payroll · ' || v_run.label || ' · ' || r.acct,
      r.acct, v_run.pay_date, null, null, null, v_run.notes, 'Payroll', true);
    update public.expenses set source_payroll_run_id = p_run_id where id = v_expense;
    v_posted := v_posted + r.amt;
  end loop;

  -- Record advance repayments (unchanged).
  for a in
    select id, advance_id, advance_repayment from public.payroll_items
    where run_id = p_run_id and advance_id is not null and advance_repayment > 0
  loop
    insert into public.cash_advance_repayments (advance_id, payroll_item_id, amount, repaid_on, note)
    values (a.advance_id, a.id, a.advance_repayment, v_run.pay_date, 'Payroll · ' || v_run.label);
    if public.cash_advance_balance(a.advance_id) <= 0 then
      update public.cash_advances set status='settled', updated_at=now() where id = a.advance_id;
    end if;
  end loop;

  update public.payroll_runs
     set status='approved', total_amount=v_posted, approved_at=now(),
         approved_by_user_id=auth.uid(), updated_at=now()
   where id = p_run_id;
end; $function$;
revoke all on function public.approve_payroll_run(uuid) from public, anon;
grant execute on function public.approve_payroll_run(uuid) to authenticated, service_role;
