-- =================================================================
-- Per-person confidentiality flag: hide expense amounts (e.g. salaries)
-- from an Ops Associate who otherwise has manager-level access.
-- Screen-level hide — the expenses page reads this flag and strips amounts
-- before they reach the browser. (Not DB-column-enforced; a dedicated role
-- would be needed for that.)
-- =================================================================

alter table public.team_members
  add column if not exists hide_expense_amounts boolean not null default false;

comment on column public.team_members.hide_expense_amounts is
  'When true, the expenses screens hide amounts/totals from this user (confidential payroll etc.). Enforced app-side, not at the DB column level.';

-- Reliable self-read of the flag regardless of team_members RLS.
create or replace function public.hide_expense_amounts_for_me()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select hide_expense_amounts from public.team_members where user_id = auth.uid()),
    false
  );
$function$;

revoke all on function public.hide_expense_amounts_for_me() from public;
grant execute on function public.hide_expense_amounts_for_me() to authenticated;
