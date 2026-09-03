-- Time-in register: clock in / out with optional GPS at each punch.
-- Applied to prod 2026-09-02 via MCP.
create table if not exists public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  clock_in_at        timestamptz not null default now(),
  clock_in_lat       double precision,
  clock_in_lng       double precision,
  clock_in_accuracy  double precision,
  clock_out_at       timestamptz,
  clock_out_lat      double precision,
  clock_out_lng      double precision,
  clock_out_accuracy double precision,
  note               text,
  created_at         timestamptz not null default now()
);
create index if not exists attendance_user_idx on public.attendance (user_id, clock_in_at desc);
create unique index if not exists attendance_one_open_per_user
  on public.attendance (user_id) where clock_out_at is null;

alter table public.attendance enable row level security;
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('owner','partner','manager'));
grant select on public.attendance to authenticated;

create or replace function public.clock_in(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid();
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if exists (select 1 from public.attendance where user_id = v_actor and clock_out_at is null) then
    raise exception 'You are already clocked in.' using errcode='22023'; end if;
  insert into public.attendance (user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy)
  values (v_actor, now(), p_lat, p_lng, p_accuracy) returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.clock_out(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid();
begin
  update public.attendance
     set clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng, clock_out_accuracy = p_accuracy
   where user_id = v_actor and clock_out_at is null returning id into v_id;
  if v_id is null then raise exception 'You are not clocked in.' using errcode='22023'; end if;
  return v_id;
end; $function$;

revoke all on function public.clock_in(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in(double precision, double precision, double precision) to authenticated, service_role;
revoke all on function public.clock_out(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_out(double precision, double precision, double precision) to authenticated, service_role;
