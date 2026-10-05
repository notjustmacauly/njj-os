-- =================================================================
-- Security hardening before customer (member) accounts exist.
--
-- current_user_role() is NULL for a signed-in user with no staff role.
-- Guards written as `current_user_role() not in (...)` / `<> 'owner'`
-- evaluate to NULL (not true) for such a user, so the `raise` never fires.
-- Today every login is staff, but member logins would walk straight through
-- (e.g. set_user_role → owner, ledger writes, payroll).
--
--  A) Rewrite every NULL-unsafe guard in SECURITY DEFINER functions so a
--     missing role is treated as "no access".
--  B) Server-only helpers (cron, edge functions, internal callers) lose
--     EXECUTE for anon/authenticated — incl. get_notification_secrets, which
--     returned the Gmail app password + VAPID keys to any login.
--  C) list_team_names: staff only.
--  D) RLS read policies that were `true` for any login → staff only.
-- =================================================================

-- A) NULL-safe guards ------------------------------------------------------
do $$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_n    int := 0;
begin
  for r in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and p.prosrc ~* 'current_user_role\(\)|v_role|v_principal|v_priv'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    -- current_user_role() not in ( … )   (with or without public., not already coalesced)
    v_new := regexp_replace(v_new, '(?<![.(\w])(public\.)?current_user_role\(\)\s+not\s+in\s*\(',
                            'coalesce(\1current_user_role()::text, '''') not in (', 'gi');
    -- current_user_role() <> '…'  /  != '…'
    v_new := regexp_replace(v_new, '(?<![.(\w])(public\.)?current_user_role\(\)\s*(<>|!=)\s*''',
                            'coalesce(\1current_user_role()::text, '''') <> ''', 'gi');
    -- := current_user_role() in ( … )   (boolean flags like v_principal / v_priv)
    v_new := regexp_replace(v_new, ':=\s*(public\.)?current_user_role\(\)\s+in\s*\(',
                            ':= coalesce(\1current_user_role()::text, '''') in (', 'gi');
    -- v_role not in ( … )   (role copied into a variable first)
    v_new := regexp_replace(v_new, '(?<![.\w])v_role\s+not\s+in\s*\(',
                            'coalesce(v_role::text, '''') not in (', 'gi');
    if v_new <> v_def then
      execute v_new;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'hardened % functions', v_n;
end $$;

-- B) Server-only helpers: no direct calls from the browser ---------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'get_notification_secrets',      -- edge fn dispatch-notification (service role)
        'ledger_apply',                  -- only via other SECURITY DEFINER functions
        '_close_pos_shift_core',         -- internal (close_pos_shift, auto_close)
        'auto_close_stale_shifts',       -- cron
        'close_expired_pin_shifts',      -- unused by the app
        'materialize_recurring_tasks',   -- cron
        'notify_overdue_tasks',          -- cron
        'notify',                        -- internal + edge fns (service role)
        'log_expense_from_telegram',     -- edge fn telegram-expense-bot (service role)
        'log_integration_error',         -- edge fns (service role)
        'record_pin_attempt',            -- unused by the app
        'reset_staff_pin',               -- unused by the app
        'cash_advance_balance',          -- internal (payroll functions)
        'partner_price_for_sku'          -- internal (create_order)
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- C) Team names: staff only ------------------------------------------------------
create or replace function public.list_team_names()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, display_name from public.team_members
  where deleted_at is null and status = 'active'
    and public.current_user_role() is not null
  order by display_name;
$$;

-- D) "Any login can read" policies → staff only -------------------------------------
drop policy if exists payees_select on public.payees;
create policy payees_select on public.payees for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists payment_proofs_select_auth on public.payment_proofs;
create policy payment_proofs_select_auth on public.payment_proofs for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager'));

drop policy if exists "allocations read" on public.order_item_batch_allocations;
create policy "allocations read" on public.order_item_batch_allocations for select to authenticated
  using (public.current_user_role() is not null);

-- Public event pages read the web_events view; the raw tables are staff-only.
drop policy if exists events_select_auth on public.events;
create policy events_select_auth on public.events for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists event_sports_read on public.event_sports;
create policy event_sports_read on public.event_sports for select to authenticated
  using (public.current_user_role() is not null);
