-- Marketing task brand + per-person attendance visibility. Applied to prod
-- 2026-09-03 via MCP.

-- 1) Brand on marketing tasks; create/update_task take p_brand (old signatures dropped).
alter table public.tasks add column if not exists brand text
  check (brand in ('NJJ','NJF','CSM','TBM','OTHER'));

drop function if exists public.create_task(text,text,uuid,text,text,date,text,text,date);
drop function if exists public.update_task(uuid,text,uuid,text,text,date,text,text,date);

create or replace function public.create_task(
  p_board text, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null, p_brand text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid();
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed to create tasks' using errcode = '42501'; end if;
  if p_board not in ('admin','marketing') then raise exception 'invalid board' using errcode='22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode='22023'; end if;
  insert into public.tasks (board, title, description, assigned_by_user_id, assigned_to_user_id,
                            priority, due_date, status, work_link, proposed_caption, post_date, brand)
  values (p_board, trim(p_title), nullif(trim(coalesce(p_description,'')),''), v_actor, p_assigned_to,
          p_priority, p_due_date, 'pending',
          nullif(trim(coalesce(p_work_link,'')),''), nullif(trim(coalesce(p_proposed_caption,'')),''), p_post_date,
          case when p_board='marketing' then p_brand else null end)
  returning id into v_id;
  if p_assigned_to is not null and p_assigned_to <> v_actor then
    perform public.notify('task','New task assigned',
      (case when p_board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', p_assigned_to, null);
  end if;
  return v_id;
end; $function$;

create or replace function public.update_task(
  p_task_id uuid, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null, p_brand text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid();
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'task not found' using errcode='23503'; end if;
  if public.current_user_role() not in ('owner','partner','manager')
     and v_actor is distinct from v.assigned_by_user_id then
    raise exception 'only the assigner or a manager can edit this task' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode='22023'; end if;
  update public.tasks set title=trim(p_title), description=nullif(trim(coalesce(p_description,'')),''),
         assigned_to_user_id=p_assigned_to, priority=p_priority, due_date=p_due_date,
         work_link=nullif(trim(coalesce(p_work_link,'')),''), proposed_caption=nullif(trim(coalesce(p_proposed_caption,'')),''),
         post_date=p_post_date, brand=case when v.board='marketing' then p_brand else v.brand end, updated_at=now()
   where id = p_task_id;
  if p_assigned_to is not null and p_assigned_to <> coalesce(v.assigned_to_user_id,'00000000-0000-0000-0000-000000000000'::uuid)
     and p_assigned_to <> v_actor then
    perform public.notify('task','Task assigned to you',
      (case when v.board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', p_assigned_to, null);
  end if;
end; $function$;

revoke all on function public.create_task(text,text,uuid,text,text,date,text,text,date,text) from public, anon;
grant execute on function public.create_task(text,text,uuid,text,text,date,text,text,date,text) to authenticated, service_role;
revoke all on function public.update_task(uuid,text,uuid,text,text,date,text,text,date,text) from public, anon;
grant execute on function public.update_task(uuid,text,uuid,text,text,date,text,text,date,text) to authenticated, service_role;

-- 2) Per-person attendance visibility.
alter table public.team_members add column if not exists attendance_supervisor boolean not null default false;

create or replace function public.am_attendance_supervisor()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select attendance_supervisor from public.team_members where user_id = auth.uid()), false);
$function$;
revoke all on function public.am_attendance_supervisor() from public, anon;
grant execute on function public.am_attendance_supervisor() to authenticated, service_role;

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('owner','partner')
    or public.am_attendance_supervisor()
  );

-- report guard: owner/partner or a supervisor (not every manager)
create or replace function public.report_attendance_monthly(p_month text default null)
returns table(user_id uuid, display_name text, shifts int, total_minutes int, open_shifts int)
language plpgsql security definer set search_path to 'public' as $function$
declare v_month text := coalesce(p_month, to_char((now() at time zone 'Asia/Manila'), 'YYYY-MM'));
begin
  if not (public.current_user_role() in ('owner','partner') or public.am_attendance_supervisor()) then
    raise exception 'insufficient privileges' using errcode='42501'; end if;
  return query
  select a.user_id, coalesce(tm.display_name,'—') as display_name,
    count(*)::int as shifts,
    coalesce(sum(greatest(0, extract(epoch from (coalesce(a.clock_out_at, now()) - a.clock_in_at))/60)),0)::int as total_minutes,
    count(*) filter (where a.clock_out_at is null)::int as open_shifts
  from public.attendance a
  left join public.team_members tm on tm.user_id = a.user_id
  where to_char((a.clock_in_at at time zone 'Asia/Manila'), 'YYYY-MM') = v_month
  group by a.user_id, tm.display_name
  order by total_minutes desc;
end; $function$;
-- NOTE: set team_members.attendance_supervisor = true for supervisors (Chrissia set in prod).
