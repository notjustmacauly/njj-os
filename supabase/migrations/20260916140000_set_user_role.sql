-- Owner-only role change (for the Team profiles hub). Prevents removing the
-- last owner. Applied to prod 2026-09-16 via MCP.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_other_owners int;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can change roles' using errcode='42501'; end if;
  if p_role not in ('owner','partner','manager','staff','marketing') then
    raise exception 'invalid role' using errcode='22023'; end if;
  if p_role <> 'owner' and exists (select 1 from public.user_roles where user_id = p_user_id and role = 'owner') then
    select count(*) into v_other_owners from public.user_roles where role = 'owner' and user_id <> p_user_id;
    if v_other_owners = 0 then
      raise exception 'cannot remove the last owner' using errcode='22023'; end if;
  end if;
  update public.user_roles set role = p_role::app_role, updated_at = now() where user_id = p_user_id;
  if not found then
    insert into public.user_roles(user_id, role) values (p_user_id, p_role::app_role);
  end if;
end; $function$;
revoke all on function public.set_user_role(uuid,text) from public, anon;
grant execute on function public.set_user_role(uuid,text) to authenticated, service_role;
