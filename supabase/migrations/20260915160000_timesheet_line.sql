-- Timesheet builder support: push a built timesheet (a full date-range grid of
-- days) into a draft payroll run as that person's line. Upserts by subject so
-- it updates the auto-generated line instead of duplicating it. Owner only.
create or replace function public.upsert_timesheet_line(
  p_run_id uuid, p_user_id uuid, p_person_id uuid, p_name text,
  p_breakdown jsonb, p_base numeric, p_hours numeric, p_account_code text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; v_id uuid;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit payroll' using errcode='42501'; end if;
  select status into v_status from public.payroll_runs where id = p_run_id;
  if v_status is null then raise exception 'run not found' using errcode='23503'; end if;
  if v_status <> 'draft' then raise exception 'run is not editable' using errcode='22023'; end if;

  if p_user_id is not null then
    select id into v_id from public.payroll_items where run_id = p_run_id and user_id = p_user_id limit 1;
  elsif p_person_id is not null then
    select id into v_id from public.payroll_items where run_id = p_run_id and person_id = p_person_id limit 1;
  end if;

  if v_id is not null then
    update public.payroll_items
       set breakdown = coalesce(p_breakdown, '[]'::jsonb),
           base_amount = coalesce(p_base, 0),
           hours = coalesce(p_hours, 0),
           account_code = coalesce(nullif(trim(p_account_code,''), ''), account_code),
           updated_at = now()
     where id = v_id;
  else
    insert into public.payroll_items (run_id, user_id, person_id, name, pay_type, hours, base_amount, breakdown, account_code)
    values (p_run_id, p_user_id, p_person_id, coalesce(nullif(trim(p_name),''),'—'),
            'manual', coalesce(p_hours,0), coalesce(p_base,0), coalesce(p_breakdown,'[]'::jsonb),
            nullif(trim(coalesce(p_account_code,'')),''))
    returning id into v_id;
  end if;
  return v_id;
end; $function$;

revoke all on function public.upsert_timesheet_line(uuid,uuid,uuid,text,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.upsert_timesheet_line(uuid,uuid,uuid,text,jsonb,numeric,numeric,text) to authenticated, service_role;
