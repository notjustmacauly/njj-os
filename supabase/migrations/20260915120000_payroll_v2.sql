-- Payroll v2 (OWNER ONLY). First-real-use fixes:
--  * per-line "Pay from" account — approval posts ONE expense per distinct
--    account (Cash / Corp / RCBC) instead of one for the whole run.
--  * editable rate + hours on every line (manual/off-system staff too).
--  * optional per-line day breakdown (jsonb) for staff whose pay varies by day.
--  * shareable per-employee payslip (public, read-only, printable → PDF).

alter table public.payroll_items
  add column if not exists account_code text,
  add column if not exists breakdown jsonb not null default '[]'::jsonb,
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists payroll_items_share_token_idx on public.payroll_items (share_token);
create index if not exists expenses_source_payroll_run_idx on public.expenses (source_payroll_run_id) where source_payroll_run_id is not null;

-- update_payroll_item now also sets rate, pay-from account and day breakdown.
drop function if exists public.update_payroll_item(uuid, numeric, numeric, numeric, text);
create or replace function public.update_payroll_item(
  p_item_id uuid, p_hours numeric, p_rate numeric, p_base_amount numeric,
  p_adjustment numeric, p_adjust_note text, p_account_code text, p_breakdown jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.id, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then raise exception 'line not found' using errcode='23503'; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  update public.payroll_items
     set hours = coalesce(p_hours, 0),
         rate = p_rate,
         base_amount = coalesce(p_base_amount, 0),
         adjustment = coalesce(p_adjustment, 0),
         adjust_note = nullif(trim(coalesce(p_adjust_note,'')),''),
         account_code = nullif(trim(coalesce(p_account_code,'')),''),
         breakdown = coalesce(p_breakdown, '[]'::jsonb),
         updated_at = now()
   where id = p_item_id;
end; $function$;

-- add_payroll_item: extra ad-hoc line (account optional, set/edit after).
drop function if exists public.add_payroll_item(uuid, text, numeric, numeric, text);
create or replace function public.add_payroll_item(
  p_run_id uuid, p_name text, p_base_amount numeric, p_account_code text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; v_id uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select status into v_status from public.payroll_runs where id = p_run_id;
  if v_status is null then raise exception 'run not found' using errcode='23503'; end if;
  if v_status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'name is required' using errcode='22023'; end if;
  insert into public.payroll_items (run_id, name, pay_type, base_amount, account_code)
  values (p_run_id, trim(p_name), 'manual', coalesce(p_base_amount,0), nullif(trim(coalesce(p_account_code,'')),''))
  returning id into v_id;
  return v_id;
end; $function$;

-- Approve → one expense per distinct pay-from account.
drop function if exists public.approve_payroll_run(uuid, text);
create or replace function public.approve_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record; v_total numeric; v_missing int; r record; v_key text; v_expense uuid;
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

  update public.payroll_runs
     set status='approved', total_amount=v_total, approved_at=now(),
         approved_by_user_id=auth.uid(), updated_at=now()
   where id = p_run_id;
end; $function$;

-- Void → reverse every expense the run posted.
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
  update public.payroll_runs
     set status='void', voided_at=now(), voided_by_user_id=auth.uid(),
         void_reason=nullif(trim(p_reason),''), updated_at=now()
   where id = p_run_id;
end; $function$;

-- Public payslip read (approved runs only). anon-executable, like invoices.
create or replace function public.get_payslip(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'run', jsonb_build_object(
      'label', pr.label, 'period_start', pr.period_start, 'period_end', pr.period_end,
      'pay_date', pr.pay_date, 'status', pr.status),
    'name', pi.name, 'pay_type', pi.pay_type, 'hours', pi.hours, 'rate', pi.rate,
    'base_amount', pi.base_amount, 'adjustment', pi.adjustment, 'adjust_note', pi.adjust_note,
    'net_amount', pi.net_amount, 'breakdown', pi.breakdown,
    'account_code', pi.account_code, 'account_name', ac.name
  ) into v
  from public.payroll_items pi
  join public.payroll_runs pr on pr.id = pi.run_id
  left join public.accounts ac on ac.code = pi.account_code
  where pi.share_token = p_token and pr.status = 'approved';
  return v;
end; $function$;

-- Grants.
revoke all on function public.update_payroll_item(uuid,numeric,numeric,numeric,numeric,text,text,jsonb) from public, anon;
grant execute on function public.update_payroll_item(uuid,numeric,numeric,numeric,numeric,text,text,jsonb) to authenticated, service_role;
revoke all on function public.add_payroll_item(uuid,text,numeric,text) from public, anon;
grant execute on function public.add_payroll_item(uuid,text,numeric,text) to authenticated, service_role;
revoke all on function public.approve_payroll_run(uuid) from public, anon;
grant execute on function public.approve_payroll_run(uuid) to authenticated, service_role;
revoke all on function public.void_payroll_run(uuid,text) from public, anon;
grant execute on function public.void_payroll_run(uuid,text) to authenticated, service_role;
revoke all on function public.get_payslip(uuid) from public;
grant execute on function public.get_payslip(uuid) to anon, authenticated, service_role;
