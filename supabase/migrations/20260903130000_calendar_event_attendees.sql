-- Calendar event attendees / affected people + notify newly-added ones.
-- Applied to prod 2026-09-03 via MCP. create/update_calendar_event now take
-- p_attendee_ids uuid[]; old signatures dropped.
create table if not exists public.calendar_event_attendees (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.calendar_event_attendees enable row level security;
drop policy if exists cea_select on public.calendar_event_attendees;
create policy cea_select on public.calendar_event_attendees for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager','staff','marketing'));
grant select on public.calendar_event_attendees to authenticated;

drop function if exists public.create_calendar_event(text,text,timestamptz,timestamptz,boolean,text,text);
drop function if exists public.update_calendar_event(uuid,text,text,timestamptz,timestamptz,boolean,text,text);

create or replace function public.create_calendar_event(
  p_title text, p_event_type text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_all_day boolean default false,
  p_location text default null, p_notes text default null,
  p_attendee_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid(); a uuid;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title))=0 then raise exception 'title is required' using errcode='22023'; end if;
  if p_event_type not in ('meeting','event','marketing','holiday','deadline','other') then
    raise exception 'invalid type' using errcode='22023'; end if;
  insert into public.calendar_events (title, event_type, starts_at, ends_at, all_day, location, notes, created_by_user_id)
  values (trim(p_title), p_event_type, p_starts_at, p_ends_at, coalesce(p_all_day,false),
          nullif(trim(coalesce(p_location,'')),''), nullif(trim(coalesce(p_notes,'')),''), v_actor)
  returning id into v_id;
  if p_attendee_ids is not null then
    foreach a in array p_attendee_ids loop
      insert into public.calendar_event_attendees(event_id, user_id) values (v_id, a) on conflict do nothing;
      if a <> v_actor then
        perform public.notify('event','Added to an event',
          trim(p_title) || ' · ' || to_char(p_starts_at at time zone 'Asia/Manila','Mon DD'),
          '/dashboard/calendar', a, null);
      end if;
    end loop;
  end if;
  return v_id;
end; $function$;

create or replace function public.update_calendar_event(
  p_id uuid, p_title text, p_event_type text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_all_day boolean default false,
  p_location text default null, p_notes text default null,
  p_attendee_ids uuid[] default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_actor uuid := auth.uid(); a uuid;
begin
  select * into v from public.calendar_events where id=p_id and deleted_at is null;
  if not found then raise exception 'event not found' using errcode='23503'; end if;
  if public.current_user_role() not in ('owner','partner','manager') and v_actor <> v.created_by_user_id then
    raise exception 'only the creator or a manager can edit this event' using errcode='42501'; end if;
  update public.calendar_events set title=trim(p_title), event_type=p_event_type, starts_at=p_starts_at,
    ends_at=p_ends_at, all_day=coalesce(p_all_day,false), location=nullif(trim(coalesce(p_location,'')),''),
    notes=nullif(trim(coalesce(p_notes,'')),''), updated_at=now() where id=p_id;
  if p_attendee_ids is not null then
    for a in select unnest(p_attendee_ids) except select user_id from public.calendar_event_attendees where event_id=p_id loop
      if a <> v_actor then
        perform public.notify('event','Added to an event',
          trim(p_title) || ' · ' || to_char(p_starts_at at time zone 'Asia/Manila','Mon DD'),
          '/dashboard/calendar', a, null);
      end if;
    end loop;
    delete from public.calendar_event_attendees where event_id=p_id;
    insert into public.calendar_event_attendees(event_id, user_id)
      select p_id, x from unnest(p_attendee_ids) as x on conflict do nothing;
  end if;
end; $function$;

revoke all on function public.create_calendar_event(text,text,timestamptz,timestamptz,boolean,text,text,uuid[]) from public, anon;
grant execute on function public.create_calendar_event(text,text,timestamptz,timestamptz,boolean,text,text,uuid[]) to authenticated, service_role;
revoke all on function public.update_calendar_event(uuid,text,text,timestamptz,timestamptz,boolean,text,text,uuid[]) from public, anon;
grant execute on function public.update_calendar_event(uuid,text,text,timestamptz,timestamptz,boolean,text,text,uuid[]) to authenticated, service_role;
