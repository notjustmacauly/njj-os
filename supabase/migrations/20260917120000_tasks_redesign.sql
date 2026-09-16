-- Tasks redesign: private personal tasks, acknowledgements, completion
-- timestamp, delete/restore, and per-person task stats.
alter table public.tasks
  add column if not exists is_private boolean not null default false,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists completed_at timestamptz;

-- Private tasks are visible only to their creator; everything else is team-wide.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    public.current_user_role() in ('owner','partner','manager','staff','marketing')
    and (is_private = false or assigned_by_user_id = auth.uid())
  );

-- create_task gains p_is_private (private = personal, assigned to self, no ping).
drop function if exists public.create_task(text,text,uuid,text,text,date,text,text,date,text);
create or replace function public.create_task(
  p_board text, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null, p_brand text default null,
  p_is_private boolean default false
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid(); v_assign uuid; v_private boolean := coalesce(p_is_private, false);
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed to create tasks' using errcode = '42501'; end if;
  if p_board not in ('admin','marketing') then raise exception 'invalid board' using errcode='22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode='22023'; end if;
  v_assign := case when v_private then v_actor else p_assigned_to end;
  insert into public.tasks (board, title, description, assigned_by_user_id, assigned_to_user_id,
                            priority, due_date, status, work_link, proposed_caption, post_date, brand, is_private)
  values (p_board, trim(p_title), nullif(trim(coalesce(p_description,'')),''), v_actor, v_assign,
          p_priority, p_due_date, 'pending',
          nullif(trim(coalesce(p_work_link,'')),''), nullif(trim(coalesce(p_proposed_caption,'')),''), p_post_date,
          case when p_board='marketing' then p_brand else null end, v_private)
  returning id into v_id;
  if not v_private and v_assign is not null and v_assign <> v_actor then
    perform public.notify('task','New task assigned',
      (case when p_board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', v_assign, null);
  end if;
  return v_id;
end; $function$;
revoke all on function public.create_task(text,text,uuid,text,text,date,text,text,date,text,boolean) from public, anon;
grant execute on function public.create_task(text,text,uuid,text,text,date,text,text,date,text,boolean) to authenticated, service_role;

-- Status change records completion time (for the Completed section + stats).
create or replace function public.update_task_status(p_task_id uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid();
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'task not found' using errcode='23503'; end if;
  if public.current_user_role() not in ('owner','partner','manager')
     and v_actor is distinct from v.assigned_by_user_id
     and v_actor is distinct from v.assigned_to_user_id then
    raise exception 'not allowed to update this task' using errcode='42501'; end if;
  if v.board = 'admin' and p_status not in ('pending','in_progress','blocked','done') then
    raise exception 'invalid status for admin board' using errcode='22023'; end if;
  if v.board = 'marketing' and p_status not in ('pending','approved','revise','scheduled','posted') then
    raise exception 'invalid status for marketing board' using errcode='22023'; end if;

  update public.tasks
     set status = p_status,
         completed_at = case when p_status in ('done','posted') then now() else null end,
         updated_at = now()
   where id = p_task_id;

  if v.assigned_by_user_id is not null and v.assigned_by_user_id <> v_actor then
    perform public.notify('task', 'Task status updated', trim(v.title) || ' → ' || p_status,
      '/dashboard/tasks', v.assigned_by_user_id, null); end if;
  if v.assigned_to_user_id is not null and v.assigned_to_user_id <> v_actor
     and v.assigned_to_user_id <> v.assigned_by_user_id then
    perform public.notify('task', 'Task status updated', trim(v.title) || ' → ' || p_status,
      '/dashboard/tasks', v.assigned_to_user_id, null); end if;
end; $function$;

-- Assignee acknowledges a task assigned to them.
create or replace function public.acknowledge_task(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid();
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'task not found' using errcode='23503'; end if;
  if v.assigned_to_user_id is distinct from v_actor then
    raise exception 'only the assignee can acknowledge this task' using errcode='42501'; end if;
  if v.acknowledged_at is null then
    update public.tasks set acknowledged_at = now(), updated_at = now() where id = p_task_id;
    if v.assigned_by_user_id is not null and v.assigned_by_user_id <> v_actor then
      perform public.notify('task','Task acknowledged', trim(v.title) || ' — acknowledged',
        '/dashboard/tasks', v.assigned_by_user_id, null);
    end if;
  end if;
end; $function$;

-- Soft delete + restore (assigner / assignee / manager+).
create or replace function public.delete_task(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid();
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then return; end if;
  if public.current_user_role() not in ('owner','partner','manager')
     and v_actor is distinct from v.assigned_by_user_id and v_actor is distinct from v.assigned_to_user_id then
    raise exception 'not allowed to delete this task' using errcode='42501'; end if;
  update public.tasks set deleted_at = now(), updated_at = now() where id = p_task_id;
end; $function$;

create or replace function public.restore_task(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid();
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is not null;
  if not found then return; end if;
  if public.current_user_role() not in ('owner','partner','manager')
     and v_actor is distinct from v.assigned_by_user_id and v_actor is distinct from v.assigned_to_user_id then
    raise exception 'not allowed to restore this task' using errcode='42501'; end if;
  update public.tasks set deleted_at = null, updated_at = now() where id = p_task_id;
end; $function$;

-- Per-person task stats for the Team profiles (owner only). Non-private only.
create or replace function public.team_task_stats()
returns table(user_id uuid, open_count int, completed_count int, completed_dated int, ontime_count int, overdue_open int)
language plpgsql security definer set search_path to 'public' as $function$
declare v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if public.current_user_role() <> 'owner' then raise exception 'not allowed' using errcode='42501'; end if;
  return query
  select t.assigned_to_user_id,
    count(*) filter (where t.status not in ('done','posted'))::int,
    count(*) filter (where t.status in ('done','posted'))::int,
    count(*) filter (where t.status in ('done','posted') and coalesce(t.due_date, t.post_date) is not null)::int,
    count(*) filter (where t.status in ('done','posted') and coalesce(t.due_date, t.post_date) is not null
                      and t.completed_at is not null
                      and (t.completed_at at time zone 'Asia/Manila')::date <= coalesce(t.due_date, t.post_date))::int,
    count(*) filter (where t.status not in ('done','posted') and coalesce(t.due_date, t.post_date) is not null
                      and coalesce(t.due_date, t.post_date) < v_today)::int
  from public.tasks t
  where t.deleted_at is null and t.is_private = false and t.assigned_to_user_id is not null
  group by t.assigned_to_user_id;
end; $function$;

revoke all on function public.acknowledge_task(uuid) from public, anon;
grant execute on function public.acknowledge_task(uuid) to authenticated, service_role;
revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid) to authenticated, service_role;
revoke all on function public.restore_task(uuid) from public, anon;
grant execute on function public.restore_task(uuid) to authenticated, service_role;
revoke all on function public.team_task_stats() from public, anon;
grant execute on function public.team_task_stats() to authenticated, service_role;
