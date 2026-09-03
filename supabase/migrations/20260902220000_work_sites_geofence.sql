-- Work sites for far-from-site flagging on clock-in. Applied to prod
-- 2026-09-02 via MCP. Flagging activates once at least one active site exists.
create table if not exists public.work_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 250,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.work_sites enable row level security;
drop policy if exists work_sites_select on public.work_sites;
create policy work_sites_select on public.work_sites for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager','staff','marketing'));
grant select on public.work_sites to authenticated;

alter table public.attendance add column if not exists clock_in_distance_m double precision;
alter table public.attendance add column if not exists clock_in_far boolean;

create or replace function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path to 'public' as $function$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$function$;
revoke all on function public.haversine_m(double precision,double precision,double precision,double precision) from public, anon;
grant execute on function public.haversine_m(double precision,double precision,double precision,double precision) to authenticated, service_role;

create or replace function public.clock_in(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid(); v_dist double precision; v_far boolean; v_site record;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if exists (select 1 from public.attendance where user_id = v_actor and clock_out_at is null) then
    raise exception 'You are already clocked in.' using errcode='22023'; end if;
  if p_lat is not null and p_lng is not null then
    select ws.radius_m, public.haversine_m(p_lat, p_lng, ws.lat, ws.lng) as dist
      into v_site
      from public.work_sites ws where ws.active
      order by public.haversine_m(p_lat, p_lng, ws.lat, ws.lng) asc limit 1;
    if found then v_dist := v_site.dist; v_far := v_site.dist > v_site.radius_m; end if;
  end if;
  insert into public.attendance (user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy, clock_in_distance_m, clock_in_far)
  values (v_actor, now(), p_lat, p_lng, p_accuracy, v_dist, v_far)
  returning id into v_id;
  return v_id;
end; $function$;
revoke all on function public.clock_in(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in(double precision, double precision, double precision) to authenticated, service_role;
