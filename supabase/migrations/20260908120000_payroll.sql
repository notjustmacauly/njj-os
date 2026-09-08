-- Payroll module (OWNER ONLY — confidential; not even partner has access).
--
-- Model: a semi-monthly "run" covers a pay period. Creating a run auto-drafts
-- one line per person on payroll:
--   * team members paid HOURLY  → hours pulled from time-in × rate
--   * team members paid FIXED   → their base salary for the period
--   * team members paid MANUAL  → blank, typed in
--   * off-system people (production staff on paper) → their default amount
-- Each line supports one signed adjustment (bonus / cash advance / absence)
-- with a note. Net = base + adjustment.
--
-- The owner reviews + edits a DRAFT run, then APPROVES it. Approval posts ONE
-- expense for the run total (category 'Payroll') through create_expense, so it
-- lands in the ledger + cost reports exactly like any other expense. Individual
-- salaries never leave these owner-only tables — only the run total
-- hits the shared expense ledger (and that amount is already hidden from Snow).
-- Voiding a run voids that expense (drops out of reports).

-- ---------------------------------------------------------------------------
-- 1. Compensation profile on team members (on-system staff: Snow, Alex, …)
-- ---------------------------------------------------------------------------
alter table public.team_members
  add column if not exists pay_type text
    check (pay_type is null or pay_type in ('hourly','fixed','manual')),
  add column if not exists pay_rate numeric;  -- hourly: ₱/hr; fixed: ₱/run

-- ---------------------------------------------------------------------------
-- 2. Off-system payroll people (paper timekeeping — e.g. production staff)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pay_type text not null default 'manual' check (pay_type in ('fixed','manual')),
  default_amount numeric not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. Runs + line items
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  label text not null,
  status text not null default 'draft' check (status in ('draft','approved','void')),
  account_code text,          -- paying account, set at approval
  total_amount numeric,       -- snapshot at approval
  expense_id uuid,            -- the single expense created at approval
  notes text,
  created_by_user_id uuid,
  approved_at timestamptz,
  approved_by_user_id uuid,
  voided_at timestamptz,
  voided_by_user_id uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  user_id uuid,               -- set for on-system team members
  person_id uuid references public.payroll_people(id) on delete set null,
  name text not null,         -- snapshot of who this line is for
  pay_type text not null default 'manual',
  rate numeric,               -- snapshot of the rate used (hourly)
  hours numeric not null default 0,
  base_amount numeric not null default 0,
  adjustment numeric not null default 0,   -- signed: + bonus, − deduction
  adjust_note text,
  net_amount numeric generated always as (base_amount + adjustment) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_items_run_idx on public.payroll_items (run_id);

-- Link the run's expense back for the void cascade.
alter table public.expenses
  add column if not exists source_payroll_run_id uuid;

-- ---------------------------------------------------------------------------
-- 4. RLS — OWNER ONLY (writes go through the RPCs below)
-- ---------------------------------------------------------------------------
alter table public.payroll_people enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

drop policy if exists payroll_people_rw on public.payroll_people;
create policy payroll_people_rw on public.payroll_people for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

drop policy if exists payroll_runs_rw on public.payroll_runs;
create policy payroll_runs_rw on public.payroll_runs for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

drop policy if exists payroll_items_rw on public.payroll_items;
create policy payroll_items_rw on public.payroll_items for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

grant select on public.payroll_people, public.payroll_runs, public.payroll_items to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.set_member_pay(
  p_user_id uuid, p_pay_type text, p_pay_rate numeric
) returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can set pay' using errcode='42501'; end if;
  if p_pay_type is not null and p_pay_type not in ('hourly','fixed','manual') then
    raise exception 'invalid pay type' using errcode='22023'; end if;
  update public.team_members
     set pay_type = p_pay_type,
         pay_rate = case when p_pay_type is null then null else p_pay_rate end,
         updated_at = now()
   where user_id = p_user_id;
end; $function$;

create or replace function public.upsert_payroll_person(
  p_id uuid, p_name text, p_pay_type text, p_default_amount numeric, p_active boolean
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can manage payroll people' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name))=0 then
    raise exception 'name is required' using errcode='22023'; end if;
  if coalesce(p_pay_type,'manual') not in ('fixed','manual') then
    raise exception 'invalid pay type' using errcode='22023'; end if;
  if p_id is null then
    insert into public.payroll_people (name, pay_type, default_amount, active)
    values (trim(p_name), coalesce(p_pay_type,'manual'), coalesce(p_default_amount,0), coalesce(p_active,true))
    returning id into v_id;
  else
    update public.payroll_people
       set name = trim(p_name), pay_type = coalesce(p_pay_type,'manual'),
           default_amount = coalesce(p_default_amount,0), active = coalesce(p_active,true),
           updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $function$;

create or replace function public.delete_payroll_person(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can manage payroll people' using errcode='42501'; end if;
  update public.payroll_people set active=false, deleted_at=now(), updated_at=now() where id=p_id;
end; $function$;

-- Create a draft run and auto-generate its lines.
create or replace function public.create_payroll_run(
  p_period_start date, p_period_end date, p_pay_date date, p_label text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_run uuid; m record; p record; v_minutes numeric; v_hours numeric; v_base numeric;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can run payroll' using errcode='42501'; end if;
  if p_period_start is null or p_period_end is null or p_pay_date is null then
    raise exception 'period and pay date are required' using errcode='22023'; end if;
  if p_period_end < p_period_start then
    raise exception 'period end is before start' using errcode='22023'; end if;

  insert into public.payroll_runs (period_start, period_end, pay_date, label, created_by_user_id)
  values (p_period_start, p_period_end, p_pay_date,
          coalesce(nullif(trim(p_label),''),
                   to_char(p_period_start,'Mon DD')||'–'||to_char(p_period_end,'DD, YYYY')),
          auth.uid())
  returning id into v_run;

  -- On-system team members with a pay profile.
  for m in
    select tm.user_id, tm.display_name, tm.pay_type, tm.pay_rate
    from public.team_members tm
    where tm.deleted_at is null and coalesce(tm.status,'active')='active'
      and tm.pay_type is not null
  loop
    v_hours := 0; v_base := 0;
    if m.pay_type = 'hourly' then
      select coalesce(sum(extract(epoch from (a.clock_out_at - a.clock_in_at))/60),0)
        into v_minutes
        from public.attendance a
       where a.user_id = m.user_id and a.clock_out_at is not null
         and (a.clock_in_at at time zone 'Asia/Manila')::date between p_period_start and p_period_end;
      v_hours := round(v_minutes/60.0, 2);
      v_base := round(v_hours * coalesce(m.pay_rate,0), 2);
    elsif m.pay_type = 'fixed' then
      v_base := coalesce(m.pay_rate,0);
    end if;  -- manual → 0
    insert into public.payroll_items (run_id, user_id, name, pay_type, rate, hours, base_amount)
    values (v_run, m.user_id, m.display_name, m.pay_type, m.pay_rate, v_hours, v_base);
  end loop;

  -- Off-system people (paper).
  for p in
    select id, name, pay_type, default_amount from public.payroll_people
    where active and deleted_at is null
  loop
    insert into public.payroll_items (run_id, person_id, name, pay_type, base_amount)
    values (v_run, p.id, p.name, p.pay_type,
            case when p.pay_type='fixed' then coalesce(p.default_amount,0) else 0 end);
  end loop;

  return v_run;
end; $function$;

create or replace function public.update_payroll_item(
  p_item_id uuid, p_hours numeric, p_base_amount numeric, p_adjustment numeric, p_adjust_note text
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.*, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then raise exception 'line not found' using errcode='23503'; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  update public.payroll_items
     set hours = coalesce(p_hours, hours),
         base_amount = coalesce(p_base_amount, base_amount),
         adjustment = coalesce(p_adjustment, 0),
         adjust_note = nullif(trim(coalesce(p_adjust_note,'')),''),
         updated_at = now()
   where id = p_item_id;
end; $function$;

create or replace function public.add_payroll_item(
  p_run_id uuid, p_name text, p_base_amount numeric, p_adjustment numeric, p_adjust_note text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; v_id uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select status into v_status from public.payroll_runs where id = p_run_id;
  if v_status is null then raise exception 'run not found' using errcode='23503'; end if;
  if v_status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'name is required' using errcode='22023'; end if;
  insert into public.payroll_items (run_id, name, pay_type, base_amount, adjustment, adjust_note)
  values (p_run_id, trim(p_name), 'manual', coalesce(p_base_amount,0), coalesce(p_adjustment,0),
          nullif(trim(coalesce(p_adjust_note,'')),''))
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.remove_payroll_item(p_item_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select pi.id, pr.status into v from public.payroll_items pi
    join public.payroll_runs pr on pr.id = pi.run_id where pi.id = p_item_id;
  if not found then return; end if;
  if v.status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;
  delete from public.payroll_items where id = p_item_id;
end; $function$;

create or replace function public.delete_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_status text;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can delete payroll' using errcode='42501'; end if;
  select status into v_status from public.payroll_runs where id = p_run_id;
  if v_status is null then return; end if;
  if v_status <> 'draft' then raise exception 'only draft runs can be deleted' using errcode='22023'; end if;
  delete from public.payroll_runs where id = p_run_id;  -- items cascade
end; $function$;

-- Approve → post ONE expense for the total through create_expense.
create or replace function public.approve_payroll_run(p_run_id uuid, p_account_code text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record; v_total numeric; v_key text; v_expense uuid; v_desc text;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can approve payroll' using errcode='42501'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode='23503'; end if;
  if v_run.status <> 'draft' then raise exception 'run is already processed' using errcode='22023'; end if;
  if p_account_code is null or length(trim(p_account_code))=0 then
    raise exception 'pick the paying account' using errcode='22023'; end if;
  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account' using errcode='22023'; end if;

  select coalesce(sum(net_amount),0) into v_total from public.payroll_items where run_id = p_run_id;
  if v_total <= 0 then raise exception 'nothing to pay in this run' using errcode='22023'; end if;

  v_key := gen_random_uuid()::text;
  v_desc := 'Payroll · ' || v_run.label;
  -- override_threshold true: payroll is the owner's own approval step.
  -- create_expense posts the ledger entry and returns the new expense id.
  v_expense := public.create_expense(
    v_key, v_total, 'Payroll', v_desc, p_account_code, v_run.pay_date,
    null, null, null, v_run.notes, 'Payroll', true);
  update public.expenses set source_payroll_run_id = p_run_id where id = v_expense;

  update public.payroll_runs
     set status='approved', account_code=p_account_code, total_amount=v_total,
         expense_id=v_expense, approved_at=now(), approved_by_user_id=auth.uid(), updated_at=now()
   where id = p_run_id;
end; $function$;

create or replace function public.void_payroll_run(p_run_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_run record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can void payroll' using errcode='42501'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if not found then raise exception 'run not found' using errcode='23503'; end if;
  if v_run.status <> 'approved' then raise exception 'only approved runs can be voided' using errcode='22023'; end if;
  if v_run.expense_id is not null then
    perform public.void_expense(v_run.expense_id, coalesce(nullif(trim(p_reason),''),'Payroll run voided'));
  end if;
  update public.payroll_runs
     set status='void', voided_at=now(), voided_by_user_id=auth.uid(),
         void_reason=nullif(trim(p_reason),''), updated_at=now()
   where id = p_run_id;
end; $function$;

-- Lock down all RPCs.
do $$
declare fn text;
begin
  for fn in
    select 'public.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'set_member_pay','upsert_payroll_person','delete_payroll_person','create_payroll_run',
      'update_payroll_item','add_payroll_item','remove_payroll_item','delete_payroll_run',
      'approve_payroll_run','void_payroll_run')
  loop
    execute 'revoke all on function '||fn||' from public, anon';
    execute 'grant execute on function '||fn||' to authenticated, service_role';
  end loop;
end $$;
