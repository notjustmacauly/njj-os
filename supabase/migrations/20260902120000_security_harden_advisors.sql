-- =================================================================
-- Security hardening from Supabase advisors (applied to prod 2026-09-02).
--  * 0011 function_search_path_mutable — pin search_path=public everywhere.
--  * 0028 anon can execute SECURITY DEFINER fns — revoke anon EXECUTE except
--    the two public token RPCs + current_user_role (called inside RLS
--    policies). Keep authenticated + service_role so the app and the edge
--    functions (Wix sync, expense bot, notifications) keep working. Trigger
--    functions get EXECUTE revoked entirely (they fire via triggers).
--  * 0010 security_definer_view — inventory_summary + unread_notification_count
--    set to security_invoker (respect the caller's RLS). web_catalog stays
--    SECURITY DEFINER by design (anon storefront reads published rows only).
-- =================================================================

do $$
declare
  r record;
  allow_anon text[] := array['get_bill_invoice', 'get_delivery_receipt', 'current_user_role'];
begin
  for r in
    select p.oid::regprocedure as sig,
           p.proname,
           p.prosecdef,
           (p.prorettype = 'pg_catalog.trigger'::regtype) as is_trigger,
           coalesce(
             p.proconfig is not null
             and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'),
             false
           ) as has_sp
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if not r.has_sp then
      execute format('alter function %s set search_path = public', r.sig);
    end if;

    if r.prosecdef then
      if r.is_trigger then
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      elsif r.proname = any(allow_anon) then
        execute format('revoke all on function %s from public', r.sig);
        execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
      else
        execute format('revoke all on function %s from public, anon', r.sig);
        execute format('grant execute on function %s to authenticated, service_role', r.sig);
      end if;
    end if;
  end loop;
end $$;

alter view public.inventory_summary set (security_invoker = on);
alter view public.unread_notification_count set (security_invoker = on);
