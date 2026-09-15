-- A default hourly rate for off-system payroll people, so the timesheet can
-- pre-fill each day's rate. Applied to prod 2026-09-15 via MCP.
alter table public.payroll_people add column if not exists default_rate numeric;

drop function if exists public.upsert_payroll_person(uuid, text, text, numeric, boolean);
create or replace function public.upsert_payroll_person(
  p_id uuid, p_name text, p_pay_type text, p_default_amount numeric, p_active boolean, p_default_rate numeric default null
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
    insert into public.payroll_people (name, pay_type, default_amount, active, default_rate)
    values (trim(p_name), coalesce(p_pay_type,'manual'), coalesce(p_default_amount,0), coalesce(p_active,true), p_default_rate)
    returning id into v_id;
  else
    update public.payroll_people
       set name = trim(p_name), pay_type = coalesce(p_pay_type,'manual'),
           default_amount = coalesce(p_default_amount,0), active = coalesce(p_active,true),
           default_rate = p_default_rate, updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $function$;
revoke all on function public.upsert_payroll_person(uuid,text,text,numeric,boolean,numeric) from public, anon;
grant execute on function public.upsert_payroll_person(uuid,text,text,numeric,boolean,numeric) to authenticated, service_role;
