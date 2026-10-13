-- (1) New marketing status "for_checking" (submitted for review). Status changes
--     already notify the task's creator + assignee, so this needs no extra wiring.
-- (2) Due-soon reminders to the assignee at ~24h and ~12h before the deadline.
--     due_date/post_date are dates; the deadline is assumed to be 17:00 Manila on
--     that day. Hourly cron, quiet 21:00–07:00, each reminder fires once.

-- (1) ------------------------------------------------------------------------
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
  if v.board = 'marketing' and p_status not in ('pending','for_checking','approved','revise','scheduled','posted','cancelled') then
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

-- (2) ------------------------------------------------------------------------
alter table public.tasks
  add column if not exists remind_24h_at timestamptz,
  add column if not exists remind_12h_at timestamptz;

-- Rescheduling a task clears its sent reminders so they fire again for the new date.
create or replace function public.tasks_reset_due_reminders()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.due_date is distinct from old.due_date or new.post_date is distinct from old.post_date then
    new.remind_24h_at := null;
    new.remind_12h_at := null;
  end if;
  return new;
end; $function$;
drop trigger if exists tasks_reset_due_reminders_trg on public.tasks;
create trigger tasks_reset_due_reminders_trg before update on public.tasks
  for each row execute function public.tasks_reset_due_reminders();

create or replace function public.notify_tasks_due_soon()
returns int language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_now timestamptz := now();
  v_hour int := extract(hour from (now() at time zone 'Asia/Manila'))::int;
  v_n int := 0; v_deadline timestamptz; v_due date; v_when text;
begin
  -- Quiet hours: only 07:00–20:59 Manila.
  if v_hour < 7 or v_hour >= 21 then return 0; end if;
  for r in
    select * from public.tasks
    where deleted_at is null
      and status not in ('done','posted','cancelled')
      and assigned_to_user_id is not null
      and coalesce(due_date, post_date) is not null
      and (remind_24h_at is null or remind_12h_at is null)
  loop
    v_due := coalesce(r.due_date, r.post_date);
    v_deadline := (v_due + time '17:00') at time zone 'Asia/Manila';
    if v_deadline <= v_now then continue; end if;  -- already due → overdue job handles it
    v_when := to_char(v_deadline at time zone 'Asia/Manila', 'Dy Mon FMDD, FMHH12:MIam');
    if r.remind_24h_at is null
       and v_now >= v_deadline - interval '24 hours'
       and v_now <  v_deadline - interval '12 hours' then
      perform public.notify('task', 'Task due tomorrow',
        trim(r.title) || ' is due ' || v_when, '/dashboard/tasks', r.assigned_to_user_id, null);
      update public.tasks set remind_24h_at = v_now where id = r.id;
      v_n := v_n + 1;
    elsif r.remind_12h_at is null
       and v_now >= v_deadline - interval '12 hours' then
      perform public.notify('task', 'Task due soon',
        trim(r.title) || ' is due ' || v_when, '/dashboard/tasks', r.assigned_to_user_id, null);
      update public.tasks set remind_12h_at = v_now where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end; $function$;
revoke all on function public.notify_tasks_due_soon() from public, anon;
grant execute on function public.notify_tasks_due_soon() to service_role;

select cron.schedule('notify-tasks-due-soon', '0 * * * *', $$ select public.notify_tasks_due_soon(); $$);

-- Also stop overdue nudges from pinging cancelled tasks.
create or replace function public.notify_overdue_tasks()
returns int language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_today date := (now() at time zone 'Asia/Manila')::date; v_n int := 0;
begin
  for r in
    select * from public.tasks
    where deleted_at is null
      and ((board='admin' and due_date is not null and due_date < v_today and status not in ('done','cancelled'))
        or (board='marketing' and post_date is not null and post_date < v_today and status not in ('posted','cancelled')))
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
