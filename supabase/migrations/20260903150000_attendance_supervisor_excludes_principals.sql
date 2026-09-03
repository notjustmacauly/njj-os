-- Attendance supervisor (e.g. Chrissia) sees the team below her but NOT
-- owner/partner (Mac/Hanneh). Applied to prod 2026-09-03 via MCP.
create or replace function public.user_is_principal(p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role in ('owner','partner'));
$function$;
revoke all on function public.user_is_principal(uuid) from public, anon;
grant execute on function public.user_is_principal(uuid) to authenticated, service_role;

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('owner','partner')
    or (public.am_attendance_supervisor() and not public.user_is_principal(attendance.user_id))
  );

create or replace function public.report_attendance_monthly(p_month text default null)
returns table(user_id uuid, display_name text, shifts int, total_minutes int, open_shifts int)
language plpgsql security definer set search_path to 'public' as $function$
declare v_month text := coalesce(p_month, to_char((now() at time zone 'Asia/Manila'), 'YYYY-MM'));
  v_principal boolean := public.current_user_role() in ('owner','partner');
begin
  if not (v_principal or public.am_attendance_supervisor()) then
    raise exception 'insufficient privileges' using errcode='42501'; end if;
  return query
  select a.user_id, coalesce(tm.display_name,'—') as display_name,
    count(*)::int as shifts,
    coalesce(sum(greatest(0, extract(epoch from (coalesce(a.clock_out_at, now()) - a.clock_in_at))/60)),0)::int as total_minutes,
    count(*) filter (where a.clock_out_at is null)::int as open_shifts
  from public.attendance a
  left join public.team_members tm on tm.user_id = a.user_id
  where to_char((a.clock_in_at at time zone 'Asia/Manila'), 'YYYY-MM') = v_month
    and (v_principal or not public.user_is_principal(a.user_id))
  group by a.user_id, tm.display_name
  order by total_minutes desc;
end; $function$;
