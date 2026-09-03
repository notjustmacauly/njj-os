-- Location is required to clock in (rejected without lat/lng). Applied to prod
-- 2026-09-03 via MCP. UI also requests GPS (high accuracy, then coarse
-- fallback) and blocks the punch if none is granted.
create or replace function public.clock_in(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_actor uuid := auth.uid(); v_dist double precision; v_far boolean; v_site record;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if p_lat is null or p_lng is null then
    raise exception 'Location is required to clock in. Turn on location and allow access, then try again.' using errcode='22023'; end if;
  if exists (select 1 from public.attendance where user_id = v_actor and clock_out_at is null) then
    raise exception 'You are already clocked in.' using errcode='22023'; end if;
  select ws.radius_m, public.haversine_m(p_lat, p_lng, ws.lat, ws.lng) as dist
    into v_site from public.work_sites ws where ws.active
    order by public.haversine_m(p_lat, p_lng, ws.lat, ws.lng) asc limit 1;
  if found then v_dist := v_site.dist; v_far := v_site.dist > v_site.radius_m; end if;
  insert into public.attendance (user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy, clock_in_distance_m, clock_in_far)
  values (v_actor, now(), p_lat, p_lng, p_accuracy, v_dist, v_far)
  returning id into v_id;
  return v_id;
end; $function$;
