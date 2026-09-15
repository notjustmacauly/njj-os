-- Unpaid break for hourly staff (e.g. Snow & Alex have a 1h unpaid lunch).
-- They don't clock out for lunch, so the raw clock-in→clock-out span overcounts.
-- Deduct the break ONCE PER DAY WORKED from the hours a run computes.

alter table public.team_members
  add column if not exists unpaid_break_min int not null default 0;

drop function if exists public.set_member_pay(uuid, text, numeric);
create or replace function public.set_member_pay(
  p_user_id uuid, p_pay_type text, p_pay_rate numeric, p_break_min int default 0
) returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can set pay' using errcode='42501'; end if;
  if p_pay_type is not null and p_pay_type not in ('hourly','fixed','manual') then
    raise exception 'invalid pay type' using errcode='22023'; end if;
  update public.team_members
     set pay_type = p_pay_type,
         pay_rate = case when p_pay_type is null then null else p_pay_rate end,
         unpaid_break_min = greatest(0, coalesce(p_break_min, 0)),
         updated_at = now()
   where user_id = p_user_id;
end; $function$;
revoke all on function public.set_member_pay(uuid,text,numeric,int) from public, anon;
grant execute on function public.set_member_pay(uuid,text,numeric,int) to authenticated, service_role;

-- Recompute hourly lines net of the unpaid break, one break per worked day.
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

  for m in
    select tm.user_id, tm.display_name, tm.pay_type, tm.pay_rate, coalesce(tm.unpaid_break_min,0) as brk
    from public.team_members tm
    where tm.deleted_at is null and coalesce(tm.status,'active')='active'
      and tm.pay_type is not null
  loop
    v_hours := 0; v_base := 0;
    if m.pay_type = 'hourly' then
      -- Sum each day's worked minutes minus one unpaid break (never below 0).
      select coalesce(sum(day_paid), 0) into v_minutes from (
        select greatest(0,
                 sum(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 60) - m.brk) as day_paid
        from public.attendance a
        where a.user_id = m.user_id and a.clock_out_at is not null
          and (a.clock_in_at at time zone 'Asia/Manila')::date between p_period_start and p_period_end
        group by (a.clock_in_at at time zone 'Asia/Manila')::date
      ) t;
      v_hours := round(v_minutes / 60.0, 2);
      v_base := round(v_hours * coalesce(m.pay_rate,0), 2);
    elsif m.pay_type = 'fixed' then
      v_base := coalesce(m.pay_rate,0);
    end if;
    insert into public.payroll_items (run_id, user_id, name, pay_type, rate, hours, base_amount)
    values (v_run, m.user_id, m.display_name, m.pay_type, m.pay_rate, v_hours, v_base);
  end loop;

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
