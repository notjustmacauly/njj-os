-- Team profiles: government IDs, an HR/incident tracker, and a per-person hours
-- summary. Owner only. Applied to prod 2026-09-16 via MCP.
alter table public.team_members
  add column if not exists sss_no text,
  add column if not exists philhealth_no text,
  add column if not exists tin_no text,
  add column if not exists pagibig_no text;

create table if not exists public.hr_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'note' check (kind in ('incident','concern','performance','commendation','note')),
  title text not null,
  details text,
  occurred_on date not null default current_date,
  severity text check (severity in ('low','medium','high')),
  logged_by_user_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists hr_incidents_user_idx on public.hr_incidents (user_id) where deleted_at is null;
alter table public.hr_incidents enable row level security;
drop policy if exists hr_incidents_rw on public.hr_incidents;
create policy hr_incidents_rw on public.hr_incidents for all to authenticated
  using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');
grant select on public.hr_incidents to authenticated;

create or replace function public.add_hr_incident(
  p_user_id uuid, p_kind text, p_title text, p_details text, p_occurred_on date, p_severity text
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() <> 'owner' then raise exception 'only the owner can log HR notes' using errcode='42501'; end if;
  if coalesce(p_kind,'note') not in ('incident','concern','performance','commendation','note') then
    raise exception 'invalid kind' using errcode='22023'; end if;
  if p_severity is not null and p_severity not in ('low','medium','high') then
    raise exception 'invalid severity' using errcode='22023'; end if;
  if p_title is null or length(trim(p_title))=0 then raise exception 'title is required' using errcode='22023'; end if;
  insert into public.hr_incidents (user_id, kind, title, details, occurred_on, severity, logged_by_user_id)
  values (p_user_id, coalesce(p_kind,'note'), trim(p_title), nullif(trim(coalesce(p_details,'')),''),
          coalesce(p_occurred_on, current_date), p_severity, auth.uid())
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.delete_hr_incident(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then raise exception 'only the owner can delete HR notes' using errcode='42501'; end if;
  update public.hr_incidents set deleted_at = now() where id = p_id;
end; $function$;

create or replace function public.team_hours_summary()
returns table(user_id uuid, month_minutes int, total_minutes int, shifts int, last_shift timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() <> 'owner' then raise exception 'not allowed' using errcode='42501'; end if;
  return query
  select a.user_id,
    coalesce(sum((extract(epoch from (a.clock_out_at - a.clock_in_at))/60))
      filter (where to_char(a.clock_in_at at time zone 'Asia/Manila','YYYY-MM') = to_char(now() at time zone 'Asia/Manila','YYYY-MM')),0)::int,
    coalesce(sum(extract(epoch from (a.clock_out_at - a.clock_in_at))/60),0)::int,
    count(*)::int,
    max(a.clock_in_at)
  from public.attendance a
  where a.clock_out_at is not null
  group by a.user_id;
end; $function$;

revoke all on function public.add_hr_incident(uuid,text,text,text,date,text) from public, anon;
grant execute on function public.add_hr_incident(uuid,text,text,text,date,text) to authenticated, service_role;
revoke all on function public.delete_hr_incident(uuid) from public, anon;
grant execute on function public.delete_hr_incident(uuid) to authenticated, service_role;
revoke all on function public.team_hours_summary() from public, anon;
grant execute on function public.team_hours_summary() to authenticated, service_role;
