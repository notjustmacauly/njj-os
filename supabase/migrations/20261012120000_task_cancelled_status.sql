-- Add a terminal "cancelled" status for tasks (not approved / canned). It's a
-- closed state like done/posted (drops off the active board) but is NOT counted
-- as a completion in perf stats, and never counts as open/overdue. Distinct
-- from a deleted task.

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
  if v.board = 'admin' and p_status not in ('pending','in_progress','blocked','done','cancelled') then
    raise exception 'invalid status for admin board' using errcode='22023'; end if;
  if v.board = 'marketing' and p_status not in ('pending','approved','revise','scheduled','posted','cancelled') then
    raise exception 'invalid status for marketing board' using errcode='22023'; end if;

  update public.tasks
     set status = p_status,
         completed_at = case when p_status in ('done','posted','cancelled') then now() else null end,
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

-- Perf stats: cancelled is neither open nor completed.
create or replace function public.team_task_stats()
returns table(user_id uuid, open_count int, completed_count int, completed_dated int, ontime_count int, overdue_open int)
language plpgsql security definer set search_path to 'public' as $function$
declare v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if public.current_user_role() <> 'owner' then raise exception 'not allowed' using errcode='42501'; end if;
  return query
  select t.assigned_to_user_id,
    count(*) filter (where t.status not in ('done','posted','cancelled'))::int,
    count(*) filter (where t.status in ('done','posted'))::int,
    count(*) filter (where t.status in ('done','posted') and coalesce(t.due_date, t.post_date) is not null)::int,
    count(*) filter (where t.status in ('done','posted') and coalesce(t.due_date, t.post_date) is not null
                      and t.completed_at is not null
                      and (t.completed_at at time zone 'Asia/Manila')::date <= coalesce(t.due_date, t.post_date))::int,
    count(*) filter (where t.status not in ('done','posted','cancelled') and coalesce(t.due_date, t.post_date) is not null
                      and coalesce(t.due_date, t.post_date) < v_today)::int
  from public.tasks t
  where t.deleted_at is null and t.is_private = false and t.assigned_to_user_id is not null
  group by t.assigned_to_user_id;
end; $function$;
