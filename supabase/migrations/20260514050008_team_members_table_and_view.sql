-- ============================================================
-- team_members: 1:1 with auth.users. Holds the human-readable
-- bits (display name, title, phone, photo, hire_date) so other
-- modules can render "Hanneh" instead of an email or UUID.
-- ============================================================

create table if not exists public.team_members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null,
  title         text,                                              -- 'Owner', 'Partner', 'Manager', or free-text label
  phone         text,
  photo_url     text,
  hire_date     date,
  status        text not null default 'active'
                  check (status in ('active','inactive','on_leave')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.team_members is
  'Per-person profile data. Joined with user_roles for the canonical role; joined with auth.users for email.';

create index if not exists idx_team_members_active on public.team_members (status, display_name)
  where deleted_at is null;

drop trigger if exists team_members_set_updated_at on public.team_members;
create trigger team_members_set_updated_at before update on public.team_members
  for each row execute function public.set_updated_at();

drop trigger if exists team_members_audit on public.team_members;
create trigger team_members_audit after insert or update or delete on public.team_members
  for each row execute function public.audit_trigger();

alter table public.team_members enable row level security;

-- All roles (owner/partner/manager) can read so pickers and "logged by"
-- labels work everywhere. Staff is excluded — they don't need the org chart.
drop policy if exists "operational read team_members" on public.team_members;
create policy "operational read team_members" on public.team_members for select to authenticated
  using (current_user_role() in ('owner','partner','manager') and deleted_at is null);

-- Anyone can read their OWN team_members row (so a staff user can render
-- their own display name in the header without exposing the rest of the team).
drop policy if exists "users read own team_member" on public.team_members;
create policy "users read own team_member" on public.team_members for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- Owner manages the team list directly via SQL or via the in-app page.
drop policy if exists "owner manages team_members" on public.team_members;
create policy "owner manages team_members" on public.team_members for all to authenticated
  using (current_user_role() = 'owner')
  with check (current_user_role() = 'owner');

-- ============================================================
-- team view: stitches user_roles + team_members. Does NOT pull
-- in auth.users here — that's exposed via a server-side helper
-- in the Next.js app because auth schema access from PostgREST
-- needs special grants we don't want to set globally.
-- ============================================================

create or replace view public.team as
  select
    tm.user_id                                  as user_id,
    tm.id                                       as team_member_id,
    coalesce(ur.role, 'staff'::public.app_role) as role,
    tm.display_name,
    tm.title,
    tm.phone,
    tm.photo_url,
    tm.hire_date,
    tm.status,
    tm.notes,
    tm.created_at,
    tm.updated_at
  from public.team_members tm
  left join public.user_roles ur on ur.user_id = tm.user_id
  where tm.deleted_at is null;

alter view public.team set (security_invoker = true);
comment on view public.team is
  'Read-friendly join of team_members + user_roles. RLS-aware via security_invoker.';
