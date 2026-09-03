-- Shared company calendar (meetings/events/marketing/holidays/etc). Task due
-- dates + marketing post dates are merged in at read time (not stored here).
-- Applied to prod 2026-09-02 via MCP.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'meeting'
    check (event_type in ('meeting','event','marketing','holiday','deadline','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  notes text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists calendar_events_starts_idx on public.calendar_events (starts_at) where deleted_at is null;
alter table public.calendar_events enable row level security;
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager','staff','marketing'));
grant select on public.calendar_events to authenticated;

create or replace function public.create_calendar_event(
  p_title text, p_event_type text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_all_day boolean default false,
  p_location text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title))=0 then raise exception 'title is required' using errcode='22023'; end if;
  if p_event_type not in ('meeting','event','marketing','holiday','deadline','other') then
    raise exception 'invalid type' using errcode='22023'; end if;
  insert into public.calendar_events (title, event_type, starts_at, ends_at, all_day, location, notes, created_by_user_id)
  values (trim(p_title), p_event_type, p_starts_at, p_ends_at, coalesce(p_all_day,false),
          nullif(trim(coalesce(p_location,'')),''), nullif(trim(coalesce(p_notes,'')),''), auth.uid())
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.update_calendar_event(
  p_id uuid, p_title text, p_event_type text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_all_day boolean default false,
  p_location text default null, p_notes text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  select * into v from public.calendar_events where id=p_id and deleted_at is null;
  if not found then raise exception 'event not found' using errcode='23503'; end if;
  if public.current_user_role() not in ('owner','partner','manager') and auth.uid() <> v.created_by_user_id then
    raise exception 'only the creator or a manager can edit this event' using errcode='42501'; end if;
  update public.calendar_events set title=trim(p_title), event_type=p_event_type, starts_at=p_starts_at,
    ends_at=p_ends_at, all_day=coalesce(p_all_day,false), location=nullif(trim(coalesce(p_location,'')),''),
    notes=nullif(trim(coalesce(p_notes,'')),''), updated_at=now() where id=p_id;
end; $function$;

create or replace function public.delete_calendar_event(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record;
begin
  select * into v from public.calendar_events where id=p_id and deleted_at is null;
  if not found then return; end if;
  if public.current_user_role() not in ('owner','partner','manager') and auth.uid() <> v.created_by_user_id then
    raise exception 'only the creator or a manager can delete this event' using errcode='42501'; end if;
  update public.calendar_events set deleted_at=now() where id=p_id;
end; $function$;

revoke all on function public.create_calendar_event(text,text,timestamptz,timestamptz,boolean,text,text) from public, anon;
grant execute on function public.create_calendar_event(text,text,timestamptz,timestamptz,boolean,text,text) to authenticated, service_role;
revoke all on function public.update_calendar_event(uuid,text,text,timestamptz,timestamptz,boolean,text,text) from public, anon;
grant execute on function public.update_calendar_event(uuid,text,text,timestamptz,timestamptz,boolean,text,text) to authenticated, service_role;
revoke all on function public.delete_calendar_event(uuid) from public, anon;
grant execute on function public.delete_calendar_event(uuid) to authenticated, service_role;
