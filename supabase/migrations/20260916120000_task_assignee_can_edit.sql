-- Let the assignee edit a task's contents (links, caption, dates, description)
-- — not just the assigner/managers — so they can update the task in place
-- instead of creating a new one. A non-privileged assignee cannot reassign it.
-- Applied to prod 2026-09-16 via MCP.
create or replace function public.update_task(
  p_task_id uuid, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid(); v_priv boolean; v_assign uuid;
begin
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'task not found' using errcode='23503'; end if;
  v_priv := public.current_user_role() in ('owner','partner','manager') or v_actor = v.assigned_by_user_id;
  if not (v_priv or v_actor = v.assigned_to_user_id) then
    raise exception 'only the assigner, the assignee, or a manager can edit this task' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode='22023'; end if;

  v_assign := case when v_priv then p_assigned_to else v.assigned_to_user_id end;
  update public.tasks set title=trim(p_title), description=nullif(trim(coalesce(p_description,'')),''),
         assigned_to_user_id=v_assign, priority=p_priority, due_date=p_due_date,
         work_link=nullif(trim(coalesce(p_work_link,'')),''), proposed_caption=nullif(trim(coalesce(p_proposed_caption,'')),''),
         post_date=p_post_date, updated_at=now()
   where id = p_task_id;

  if v_priv and v_assign is not null
     and v_assign <> coalesce(v.assigned_to_user_id,'00000000-0000-0000-0000-000000000000'::uuid)
     and v_assign <> v_actor then
    perform public.notify('task','Task assigned to you',
      (case when v.board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', v_assign, null);
  end if;
end; $function$;
revoke all on function public.update_task(uuid,text,uuid,text,text,date,text,text,date) from public, anon;
grant execute on function public.update_task(uuid,text,uuid,text,text,date,text,text,date) to authenticated, service_role;
