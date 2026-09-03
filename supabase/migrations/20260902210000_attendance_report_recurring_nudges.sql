-- Attendance monthly report + recurring task templates + overdue nudges.
-- Applied to prod 2026-09-02 via MCP. Two pg_cron jobs are scheduled at the
-- bottom (materialise recurring tasks 09:00 PH; overdue nudges 08:30 PH).

create or replace function public.report_attendance_monthly(p_month text default null)
returns table(user_id uuid, display_name text, shifts int, total_minutes int, open_shifts int)
language plpgsql security definer set search_path to 'public' as $function$
declare v_month text := coalesce(p_month, to_char((now() at time zone 'Asia/Manila'), 'YYYY-MM'));
begin
  if public.current_user_role() not in ('owner','partner','manager') then
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
revoke all on function public.report_attendance_monthly(text) from public, anon;
grant execute on function public.report_attendance_monthly(text) to authenticated, service_role;

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('admin','marketing')),
  title text not null,
  description text,
  assigned_to_user_id uuid,
  priority text check (priority in ('low','normal','high','urgent')),
  cadence text not null check (cadence in ('daily','weekly','monthly')),
  weekday int check (weekday between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  lead_days int not null default 0,
  active boolean not null default true,
  created_by_user_id uuid not null,
  last_created_on date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.task_templates enable row level security;
drop policy if exists task_templates_select on public.task_templates;
create policy task_templates_select on public.task_templates for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager'));
grant select on public.task_templates to authenticated;

create or replace function public.save_task_template(
  p_id uuid, p_board text, p_title text, p_cadence text, p_assigned_to uuid default null,
  p_description text default null, p_priority text default null, p_weekday int default null,
  p_day_of_month int default null, p_lead_days int default 0, p_active boolean default true
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() not in ('owner','partner','manager') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if p_id is null then
    insert into public.task_templates(board,title,description,assigned_to_user_id,priority,cadence,weekday,day_of_month,lead_days,active,created_by_user_id)
    values (p_board, trim(p_title), nullif(trim(coalesce(p_description,'')),''), p_assigned_to, p_priority, p_cadence, p_weekday, p_day_of_month, coalesce(p_lead_days,0), coalesce(p_active,true), auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  update public.task_templates set board=p_board, title=trim(p_title), description=nullif(trim(coalesce(p_description,'')),''),
    assigned_to_user_id=p_assigned_to, priority=p_priority, cadence=p_cadence, weekday=p_weekday,
    day_of_month=p_day_of_month, lead_days=coalesce(p_lead_days,0), active=coalesce(p_active,true)
   where id=p_id and deleted_at is null;
  return p_id;
end; $function$;

create or replace function public.delete_task_template(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.current_user_role() not in ('owner','partner','manager') then
    raise exception 'not allowed' using errcode='42501'; end if;
  update public.task_templates set deleted_at=now() where id=p_id;
end; $function$;

create or replace function public.materialize_recurring_tasks()
returns int language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_today date := (now() at time zone 'Asia/Manila')::date;
  v_dow int := extract(dow from (now() at time zone 'Asia/Manila'))::int;
  v_dom int := extract(day from (now() at time zone 'Asia/Manila'))::int;
  v_count int := 0; v_date date;
begin
  for r in select * from public.task_templates where active and deleted_at is null loop
    if r.last_created_on = v_today then continue; end if;
    if r.cadence='daily'
       or (r.cadence='weekly' and r.weekday = v_dow)
       or (r.cadence='monthly' and r.day_of_month = v_dom) then
      v_date := v_today + coalesce(r.lead_days,0);
      insert into public.tasks(board,title,description,assigned_by_user_id,assigned_to_user_id,priority,due_date,status,post_date)
      values (r.board, r.title, r.description, r.created_by_user_id, r.assigned_to_user_id, r.priority,
              case when r.board='admin' then v_date else null end, 'pending',
              case when r.board='marketing' then v_date else null end);
      if r.assigned_to_user_id is not null then
        perform public.notify('task','New recurring task',
          (case when r.board='marketing' then 'Marketing' else 'Admin' end)||': '||r.title,
          '/dashboard/tasks', r.assigned_to_user_id, null);
      end if;
      update public.task_templates set last_created_on = v_today where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $function$;

create or replace function public.notify_overdue_tasks()
returns int language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_today date := (now() at time zone 'Asia/Manila')::date; v_n int := 0;
begin
  for r in
    select * from public.tasks
    where deleted_at is null
      and ((board='admin' and due_date is not null and due_date < v_today and status <> 'done')
        or (board='marketing' and post_date is not null and post_date < v_today and status <> 'posted'))
  loop
    if r.assigned_to_user_id is not null then
      perform public.notify('task','Overdue task', r.title||' is overdue', '/dashboard/tasks', r.assigned_to_user_id, null);
      v_n := v_n + 1;
    end if;
    if r.assigned_by_user_id is not null and r.assigned_by_user_id is distinct from r.assigned_to_user_id then
      perform public.notify('task','Overdue task', r.title||' is overdue', '/dashboard/tasks', r.assigned_by_user_id, null);
    end if;
  end loop;
  return v_n;
end; $function$;

revoke all on function public.save_task_template(uuid,text,text,text,uuid,text,text,int,int,int,boolean) from public, anon;
grant execute on function public.save_task_template(uuid,text,text,text,uuid,text,text,int,int,int,boolean) to authenticated, service_role;
revoke all on function public.delete_task_template(uuid) from public, anon;
grant execute on function public.delete_task_template(uuid) to authenticated, service_role;
revoke all on function public.materialize_recurring_tasks() from public, anon;
grant execute on function public.materialize_recurring_tasks() to service_role;
revoke all on function public.notify_overdue_tasks() from public, anon;
grant execute on function public.notify_overdue_tasks() to service_role;

select cron.schedule('materialize-recurring-tasks', '0 1 * * *', $$ select public.materialize_recurring_tasks(); $$);
select cron.schedule('notify-overdue-tasks', '30 0 * * *', $$ select public.notify_overdue_tasks(); $$);
