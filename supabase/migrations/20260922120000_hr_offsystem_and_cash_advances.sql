-- HR + payroll: (1) bring off-system production staff into the Team HR view,
-- (2) cash advances repaid in tranches via payslip deductions.
-- OWNER ONLY throughout. NOT yet applied to prod (pending owner approval).

-- ===========================================================================
-- 1. Off-system people get the same HR/identity fields as team members
--    (payroll_people already has name, notes, pay_type, default_amount,
--     default_rate, email, active).
-- ===========================================================================
alter table public.payroll_people
  add column if not exists title text,
  add column if not exists phone text,
  add column if not exists hire_date date,
  add column if not exists sss_no text,
  add column if not exists philhealth_no text,
  add column if not exists tin_no text,
  add column if not exists pagibig_no text;

-- Owner-only editor for an off-system person's HR/identity fields (pay stays on
-- upsert_payroll_person / Pay setup).
create or replace function public.set_payroll_person_profile(
  p_id uuid, p_title text, p_phone text, p_hire_date date,
  p_sss_no text, p_philhealth_no text, p_tin_no text, p_pagibig_no text
) returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit HR profiles' using errcode='42501'; end if;
  update public.payroll_people set
      title = nullif(trim(coalesce(p_title,'')),''),
      phone = nullif(trim(coalesce(p_phone,'')),''),
      hire_date = p_hire_date,
      sss_no = nullif(trim(coalesce(p_sss_no,'')),''),
      philhealth_no = nullif(trim(coalesce(p_philhealth_no,'')),''),
      tin_no = nullif(trim(coalesce(p_tin_no,'')),''),
      pagibig_no = nullif(trim(coalesce(p_pagibig_no,'')),''),
      updated_at = now()
   where id = p_id;
end; $function$;
revoke all on function public.set_payroll_person_profile(uuid,text,text,date,text,text,text,text) from public, anon;
grant execute on function public.set_payroll_person_profile(uuid,text,text,date,text,text,text,text) to authenticated, service_role;

-- ===========================================================================
-- 2. HR incidents can now be filed against an off-system person too.
--    (was user_id-only). Exactly one subject per row.
-- ===========================================================================
alter table public.hr_incidents
  add column if not exists person_id uuid references public.payroll_people(id) on delete cascade;
alter table public.hr_incidents alter column user_id drop not null;
alter table public.hr_incidents drop constraint if exists hr_incidents_subject_ck;
alter table public.hr_incidents add constraint hr_incidents_subject_ck
  check ((user_id is not null) <> (person_id is not null));
create index if not exists hr_incidents_person_idx on public.hr_incidents (person_id) where deleted_at is null;

-- Extend add_hr_incident with a person subject. Drop the old 6-arg version so
-- the subject check is always enforced (the client now always sends p_person_id).
drop function if exists public.add_hr_incident(uuid,text,text,text,date,text);
create or replace function public.add_hr_incident(
  p_user_id uuid, p_kind text, p_title text, p_details text, p_occurred_on date, p_severity text,
  p_person_id uuid default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() <> 'owner' then raise exception 'only the owner can log HR notes' using errcode='42501'; end if;
  if (p_user_id is not null) = (p_person_id is not null) then
    raise exception 'exactly one subject (team member or off-system person) is required' using errcode='22023'; end if;
  if coalesce(p_kind,'note') not in ('incident','concern','performance','commendation','note') then
    raise exception 'invalid kind' using errcode='22023'; end if;
  if p_severity is not null and p_severity not in ('low','medium','high') then
    raise exception 'invalid severity' using errcode='22023'; end if;
  if p_title is null or length(trim(p_title))=0 then raise exception 'title is required' using errcode='22023'; end if;
  insert into public.hr_incidents (user_id, person_id, kind, title, details, occurred_on, severity, logged_by_user_id)
  values (p_user_id, p_person_id, coalesce(p_kind,'note'), trim(p_title), nullif(trim(coalesce(p_details,'')),''),
          coalesce(p_occurred_on, current_date), p_severity, auth.uid())
  returning id into v_id;
  return v_id;
end; $function$;
revoke all on function public.add_hr_incident(uuid,text,text,text,date,text,uuid) from public, anon;
grant execute on function public.add_hr_incident(uuid,text,text,text,date,text,uuid) to authenticated, service_role;

-- ===========================================================================
-- 3. Cash advances (owner only). A loan to a person, repaid in fixed ₱ tranches
--    deducted from future payslips. Disbursement posts a real ledger expense
--    ('Cash Advance'); each payslip repayment lowers net pay, so the books
--    settle to the true total salary cost over the life of the advance.
-- ===========================================================================
create table if not exists public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                        -- on-system subject
  person_id uuid references public.payroll_people(id) on delete set null,  -- off-system subject
  name text not null,                  -- snapshot of who it's for
  principal numeric not null check (principal > 0),
  advance_date date not null default current_date,
  installment numeric not null default 0 check (installment >= 0),  -- fixed ₱ per pay run
  account_code text,                   -- account the cash went out of
  expense_id uuid,                     -- disbursement expense in the ledger
  status text not null default 'outstanding' check (status in ('outstanding','settled','void')),
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cash_advances_subject_ck check ((user_id is not null) <> (person_id is not null))
);
create index if not exists cash_advances_user_idx on public.cash_advances (user_id) where deleted_at is null;
create index if not exists cash_advances_person_idx on public.cash_advances (person_id) where deleted_at is null;

create table if not exists public.cash_advance_repayments (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.cash_advances(id) on delete cascade,
  payroll_item_id uuid references public.payroll_items(id) on delete set null,
  amount numeric not null check (amount > 0),
  repaid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists cash_advance_repayments_advance_idx on public.cash_advance_repayments (advance_id);
create index if not exists cash_advance_repayments_item_idx on public.cash_advance_repayments (payroll_item_id);

alter table public.cash_advances enable row level security;
alter table public.cash_advance_repayments enable row level security;
drop policy if exists cash_advances_rw on public.cash_advances;
create policy cash_advances_rw on public.cash_advances for all to authenticated
  using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');
drop policy if exists cash_advance_repayments_rw on public.cash_advance_repayments;
create policy cash_advance_repayments_rw on public.cash_advance_repayments for all to authenticated
  using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');
grant select on public.cash_advances, public.cash_advance_repayments to authenticated;

-- Remaining balance of an advance = principal − repayments applied so far.
create or replace function public.cash_advance_balance(p_advance_id uuid)
returns numeric language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select principal from public.cash_advances where id = p_advance_id), 0)
       - coalesce((select sum(amount) from public.cash_advance_repayments where advance_id = p_advance_id), 0);
$function$;

-- ===========================================================================
-- 4. Payroll line gains a cash-advance repayment deduction, folded into net.
-- ===========================================================================
alter table public.payroll_items
  add column if not exists advance_repayment numeric not null default 0,
  add column if not exists advance_id uuid references public.cash_advances(id) on delete set null;

alter table public.payroll_items drop column net_amount;
alter table public.payroll_items add column net_amount numeric generated always as (
  base_amount + overtime_pay + bonuses
  - (tax + philhealth + sss + pagibig + absences + other_deductions + advance_repayment)
) stored;

-- ===========================================================================
-- 5. RPCs — create / void advance, apply a tranche to a draft payroll line,
--    and list advances with live balances.
-- ===========================================================================

-- Record a new advance and post the disbursement to the ledger.
create or replace function public.create_cash_advance(
  p_user_id uuid, p_person_id uuid, p_amount numeric, p_advance_date date,
  p_installment numeric, p_account_code text, p_notes text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_name text; v_expense uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can record cash advances' using errcode='42501'; end if;
  if (p_user_id is not null) = (p_person_id is not null) then
    raise exception 'pick exactly one person for the advance' using errcode='22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive' using errcode='22023'; end if;
  if p_account_code is null or not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'a valid paying account is required' using errcode='22023'; end if;

  -- Resolve the subject's display name for the snapshot.
  if p_user_id is not null then
    select coalesce(display_name, 'Team member') into v_name from public.team_members where user_id = p_user_id;
  else
    select name into v_name from public.payroll_people where id = p_person_id;
  end if;
  if v_name is null then raise exception 'person not found' using errcode='23503'; end if;

  insert into public.cash_advances (user_id, person_id, name, principal, advance_date, installment, account_code, notes, created_by_user_id)
  values (p_user_id, p_person_id, v_name, p_amount, coalesce(p_advance_date, current_date),
          greatest(coalesce(p_installment,0),0), p_account_code, nullif(trim(coalesce(p_notes,'')),''), auth.uid())
  returning id into v_id;

  -- Post the cash-out to the ledger as a 'Cash Advance' expense.
  v_expense := public.create_expense(
    'cash-advance-' || v_id::text, p_amount, 'Cash Advance',
    'Cash advance · ' || v_name, p_account_code, coalesce(p_advance_date, current_date),
    null, null, null, nullif(trim(coalesce(p_notes,'')),''), 'Payroll', true);
  update public.cash_advances set expense_id = v_expense where id = v_id;
  return v_id;
end; $function$;
revoke all on function public.create_cash_advance(uuid,uuid,numeric,date,numeric,text,text) from public, anon;
grant execute on function public.create_cash_advance(uuid,uuid,numeric,date,numeric,text,text) to authenticated, service_role;

-- Void an advance (only if nothing has been repaid yet) and reverse its expense.
create or replace function public.void_cash_advance(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_repaid numeric;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can void cash advances' using errcode='42501'; end if;
  select * into v from public.cash_advances where id = p_id;
  if not found then raise exception 'advance not found' using errcode='23503'; end if;
  select coalesce(sum(amount),0) into v_repaid from public.cash_advance_repayments where advance_id = p_id;
  if v_repaid > 0 then raise exception 'cannot void — repayments already recorded; void the pay run first' using errcode='22023'; end if;
  if v.expense_id is not null then
    perform public.void_expense(v.expense_id, coalesce(nullif(trim(p_reason),''),'Cash advance voided'));
  end if;
  update public.cash_advances set status='void', deleted_at=now(), updated_at=now() where id = p_id;
end; $function$;
revoke all on function public.void_cash_advance(uuid,text) from public, anon;
grant execute on function public.void_cash_advance(uuid,text) to authenticated, service_role;

-- Apply / clear an advance repayment on a DRAFT payroll line. Amount is capped
-- at the chosen advance's remaining balance. Amount 0 clears it.
create or replace function public.set_payroll_advance(
  p_item_id uuid, p_advance_id uuid, p_amount numeric
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_bal numeric; v_amt numeric;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.id, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then raise exception 'line not found' using errcode='23503'; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;

  v_amt := greatest(coalesce(p_amount,0), 0);
  if v_amt = 0 or p_advance_id is null then
    update public.payroll_items set advance_repayment = 0, advance_id = null, updated_at = now() where id = p_item_id;
    return;
  end if;
  if not exists (select 1 from public.cash_advances where id = p_advance_id and status = 'outstanding') then
    raise exception 'advance is not outstanding' using errcode='22023'; end if;
  v_bal := public.cash_advance_balance(p_advance_id);
  if v_amt > v_bal then v_amt := v_bal; end if;
  update public.payroll_items set advance_repayment = v_amt, advance_id = p_advance_id, updated_at = now() where id = p_item_id;
end; $function$;
revoke all on function public.set_payroll_advance(uuid,uuid,numeric) from public, anon;
grant execute on function public.set_payroll_advance(uuid,uuid,numeric) to authenticated, service_role;

-- Owner list of advances with live balance + subject, newest first.
create or replace function public.list_cash_advances()
returns table(
  id uuid, user_id uuid, person_id uuid, name text, principal numeric,
  balance numeric, installment numeric, advance_date date, account_code text,
  status text, notes text
) language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then raise exception 'not allowed' using errcode='42501'; end if;
  return query
  select ca.id, ca.user_id, ca.person_id, ca.name, ca.principal,
         public.cash_advance_balance(ca.id), ca.installment, ca.advance_date, ca.account_code,
         ca.status, ca.notes
  from public.cash_advances ca
  where ca.status <> 'void'
  order by ca.advance_date desc, ca.created_at desc;
end; $function$;
revoke all on function public.list_cash_advances() from public, anon;
grant execute on function public.list_cash_advances() to authenticated, service_role;

-- ===========================================================================
-- 6. Approve / void now record / reverse advance repayments.
-- ===========================================================================
create or replace function public.approve_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record; v_total numeric; v_missing int; r record; v_key text; v_expense uuid; a record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can approve payroll' using errcode='42501'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode='23503'; end if;
  if v_run.status <> 'draft' then raise exception 'run is already processed' using errcode='22023'; end if;

  select coalesce(sum(net_amount),0) into v_total from public.payroll_items where run_id = p_run_id;
  if v_total <= 0 then raise exception 'nothing to pay in this run' using errcode='22023'; end if;

  select count(*) into v_missing from public.payroll_items
   where run_id = p_run_id and net_amount <> 0 and (account_code is null or account_code = '');
  if v_missing > 0 then
    raise exception 'every paid line needs a Pay-from account (% still missing)', v_missing using errcode='22023'; end if;

  for r in
    select account_code, sum(net_amount) as amt
    from public.payroll_items where run_id = p_run_id and net_amount <> 0
    group by account_code
  loop
    if not exists (select 1 from public.accounts where code = r.account_code) then
      raise exception 'unknown account %', r.account_code using errcode='22023'; end if;
    if r.amt > 0 then
      v_key := gen_random_uuid()::text;
      v_expense := public.create_expense(
        v_key, r.amt, 'Payroll', 'Payroll · ' || v_run.label || ' · ' || r.account_code,
        r.account_code, v_run.pay_date, null, null, null, v_run.notes, 'Payroll', true);
      update public.expenses set source_payroll_run_id = p_run_id where id = v_expense;
    end if;
  end loop;

  -- Record each line's advance repayment against its advance; settle when cleared.
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
     set status='approved', total_amount=v_total, approved_at=now(),
         approved_by_user_id=auth.uid(), updated_at=now()
   where id = p_run_id;
end; $function$;
revoke all on function public.approve_payroll_run(uuid) from public, anon;
grant execute on function public.approve_payroll_run(uuid) to authenticated, service_role;

create or replace function public.void_payroll_run(p_run_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record; r record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can void payroll' using errcode='42501'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode='23503'; end if;
  if v_run.status <> 'approved' then raise exception 'only approved runs can be voided' using errcode='22023'; end if;
  for r in select id from public.expenses where source_payroll_run_id = p_run_id and voided_at is null loop
    perform public.void_expense(r.id, coalesce(nullif(trim(p_reason),''),'Payroll run voided'));
  end loop;
  -- Reverse advance repayments recorded by this run and re-open any settled advances.
  update public.cash_advances set status='outstanding', updated_at=now()
   where status='settled' and id in (
     select rp.advance_id from public.cash_advance_repayments rp
     join public.payroll_items pi on pi.id = rp.payroll_item_id
     where pi.run_id = p_run_id);
  delete from public.cash_advance_repayments where payroll_item_id in (
    select id from public.payroll_items where run_id = p_run_id);
  update public.payroll_runs
     set status='void', voided_at=now(), voided_by_user_id=auth.uid(),
         void_reason=nullif(trim(p_reason),''), updated_at=now()
   where id = p_run_id;
end; $function$;
revoke all on function public.void_payroll_run(uuid,text) from public, anon;
grant execute on function public.void_payroll_run(uuid,text) to authenticated, service_role;

-- ===========================================================================
-- 7. Payslip returns the advance repayment line.
-- ===========================================================================
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
