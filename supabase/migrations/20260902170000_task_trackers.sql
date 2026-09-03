-- Task trackers (admin + marketing boards) with in-app notifications.
-- Writes go only through the SECURITY DEFINER RPCs below, which also fire
-- notifications (assignee on assign; assigner on status change; the other
-- party on a new comment). Applied to prod 2026-09-02 via MCP.
create table if not exists public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  board               text not null check (board in ('admin','marketing')),
  title               text not null,
  description         text,
  assigned_by_user_id uuid not null,
  assigned_to_user_id uuid,
  priority            text check (priority in ('low','normal','high','urgent')),
  due_date            date,
  status              text not null,
  work_link           text,
  proposed_caption    text,
  post_date           date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint tasks_status_valid check (
    (board = 'admin'     and status in ('pending','in_progress','blocked','done'))
    or (board = 'marketing' and status in ('pending','approved','revise','scheduled','posted'))
  )
);
create index if not exists tasks_board_status_idx on public.tasks (board, status) where deleted_at is null;
create index if not exists tasks_assignee_idx on public.tasks (assigned_to_user_id) where deleted_at is null;

create table if not exists public.task_comments (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  author_user_id uuid not null,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager','staff','marketing'));
drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager','staff','marketing'));

grant select on public.tasks to authenticated;
grant select on public.task_comments to authenticated;

create or replace function public.create_task(
  p_board text, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid();
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed to create tasks' using errcode = '42501'; end if;
  if p_board not in ('admin','marketing') then raise exception 'invalid board' using errcode='22023'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title is required' using errcode='22023'; end if;
  insert into public.tasks (board, title, description, assigned_by_user_id, assigned_to_user_id,
                            priority, due_date, status, work_link, proposed_caption, post_date)
  values (p_board, trim(p_title), nullif(trim(coalesce(p_description,'')),''), v_actor, p_assigned_to,
          p_priority, p_due_date, 'pending',
          nullif(trim(coalesce(p_work_link,'')),''), nullif(trim(coalesce(p_proposed_caption,'')),''), p_post_date)
  returning id into v_id;
  if p_assigned_to is not null and p_assigned_to <> v_actor then
    perform public.notify('task','New task assigned',
      (case when p_board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', p_assigned_to, null);
  end if;
  return v_id;
end; $function$;

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
  update public.tasks set status = p_status, updated_at = now() where id = p_task_id;
  if v.assigned_by_user_id is not null and v.assigned_by_user_id <> v_actor then
    perform public.notify('task','Task status updated', trim(v.title) || ' → ' || p_status,
      '/dashboard/tasks', v.assigned_by_user_id, null);
  end if;
  if v.assigned_to_user_id is not null and v.assigned_to_user_id <> v_actor
     and v.assigned_to_user_id <> v.assigned_by_user_id then
    perform public.notify('task','Task status updated', trim(v.title) || ' → ' || p_status,
      '/dashboard/tasks', v.assigned_to_user_id, null);
  end if;
end; $function$;

create or replace function public.update_task(
  p_task_id uuid, p_title text, p_assigned_to uuid default null, p_description text default null,
  p_priority text default null, p_due_date date default null, p_work_link text default null,
  p_proposed_caption text default null, p_post_date date default null
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
         post_date=p_post_date, updated_at=now()
   where id = p_task_id;
  if p_assigned_to is not null and p_assigned_to <> coalesce(v.assigned_to_user_id,'00000000-0000-0000-0000-000000000000'::uuid)
     and p_assigned_to <> v_actor then
    perform public.notify('task','Task assigned to you',
      (case when v.board='marketing' then 'Marketing' else 'Admin' end) || ': ' || trim(p_title),
      '/dashboard/tasks', p_assigned_to, null);
  end if;
end; $function$;

create or replace function public.add_task_comment(p_task_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_id uuid; v_actor uuid := auth.uid(); v_other uuid;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  select * into v from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'task not found' using errcode='23503'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'comment is empty' using errcode='22023'; end if;
  insert into public.task_comments (task_id, author_user_id, body)
  values (p_task_id, v_actor, trim(p_body)) returning id into v_id;
  v_other := case when v_actor = v.assigned_to_user_id then v.assigned_by_user_id else v.assigned_to_user_id end;
  if v_other is not null and v_other <> v_actor then
    perform public.notify('task','New comment on a task', trim(v.title) || ': ' || left(trim(p_body),80),
      '/dashboard/tasks', v_other, null);
  end if;
  return v_id;
end; $function$;

revoke all on function public.create_task(text,text,uuid,text,text,date,text,text,date) from public, anon;
grant execute on function public.create_task(text,text,uuid,text,text,date,text,text,date) to authenticated, service_role;
revoke all on function public.update_task_status(uuid,text) from public, anon;
grant execute on function public.update_task_status(uuid,text) to authenticated, service_role;
revoke all on function public.update_task(uuid,text,uuid,text,text,date,text,text,date) from public, anon;
grant execute on function public.update_task(uuid,text,uuid,text,text,date,text,text,date) to authenticated, service_role;
revoke all on function public.add_task_comment(uuid,text) from public, anon;
grant execute on function public.add_task_comment(uuid,text) to authenticated, service_role;

create or replace function public.list_team_names()
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path to 'public' as $function$
  select user_id, display_name from public.team_members
  where deleted_at is null and status = 'active' order by display_name;
$function$;
revoke all on function public.list_team_names() from public, anon;
grant execute on function public.list_team_names() to authenticated, service_role;
