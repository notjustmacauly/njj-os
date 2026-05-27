-- =================================================================
-- Staff PIN auth — 4-digit PIN login for the Staff role.
--
-- Adds:
--   - staff_pins table (bcrypt-hashed PINs, lockout tracking)
--   - set_staff_pin / reset_staff_pin / disable_staff_pin RPCs
--   - pos_shifts columns to track PIN-session origin + auto-close reason
--   - close_expired_pin_shifts() function (callable by the middleware
--     or an external scheduler; we don't wire pg_cron in this migration)
--   - record_pin_failure() helper used by the verify-staff-pin Edge Function
--
-- Spec: docs/specs/STAFF_PIN_AUTH.md
-- =================================================================

-- ---------- 1) pos_shifts: track PIN-session origin and auto-close
alter table public.pos_shifts
  add column if not exists opened_via_pin    boolean not null default false,
  add column if not exists pin_entered_at    timestamptz,
  add column if not exists auto_closed_reason text;

comment on column public.pos_shifts.opened_via_pin is
  'true when the operator signed in with a 4-digit PIN. Used by close_expired_pin_shifts.';
comment on column public.pos_shifts.pin_entered_at is
  'timestamp the PIN session began. Shift auto-closes 24h after this.';
comment on column public.pos_shifts.auto_closed_reason is
  'Set by the auto-close routine. Values: pin_session_expired, etc.';

-- ---------- 2) staff_pins table
create table if not exists public.staff_pins (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  pin_hash         text,                                       -- nullable so disable_staff_pin can clear without losing the row
  set_at           timestamptz,
  set_by_user_id   uuid references auth.users(id),
  last_used_at     timestamptz,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.staff_pins is
  'One row per staff user that has (or has ever had) a PIN. pin_hash is bcrypt, never readable by client.';

drop trigger if exists staff_pins_set_updated_at on public.staff_pins;
create trigger staff_pins_set_updated_at before update on public.staff_pins
  for each row execute function public.set_updated_at();

-- staff_pins is sensitive — no client reads ever. The verify-staff-pin Edge
-- Function reads through the service_role key, bypassing RLS.
alter table public.staff_pins enable row level security;

drop policy if exists "no client reads of staff_pins" on public.staff_pins;
create policy "no client reads of staff_pins" on public.staff_pins
  for select to authenticated using (false);

-- No insert/update/delete policy: all writes go through SECURITY DEFINER RPCs below.

-- ---------- 3) set_staff_pin RPC
-- Owner / Partner can set or rotate a staff member's PIN. Single-step
-- rotation: pass the new PIN, it overwrites whatever was there.
create or replace function public.set_staff_pin(
  p_user_id uuid,
  p_pin     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     app_role;
  v_existing record;
  v_match    int;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can set staff PINs' using errcode = '42501';
  end if;

  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = '22023';
  end if;

  select role into v_role from public.user_roles where user_id = p_user_id;
  if v_role is null then
    raise exception 'user has no role assigned: %', p_user_id using errcode = '23503';
  end if;
  if v_role <> 'staff' then
    raise exception 'PIN auth is staff-only (target user is %)', v_role using errcode = '22023';
  end if;

  -- Uniqueness: bcrypt-compare the proposed PIN against every other active
  -- staff_pins row. With <=20 staff this is cheap.
  select count(*) into v_match
    from public.staff_pins
   where user_id <> p_user_id
     and pin_hash is not null
     and pin_hash = crypt(p_pin, pin_hash);
  if v_match > 0 then
    raise exception 'that PIN is already in use by another staff member — choose another'
      using errcode = '23505';
  end if;

  insert into public.staff_pins (user_id, pin_hash, set_at, set_by_user_id)
  values (p_user_id, crypt(p_pin, gen_salt('bf', 10)), now(), auth.uid())
  on conflict (user_id) do update
     set pin_hash         = excluded.pin_hash,
         set_at           = now(),
         set_by_user_id   = auth.uid(),
         failed_attempts  = 0,
         locked_until     = null,
         updated_at       = now();
end;
$$;

revoke all on function public.set_staff_pin(uuid, text) from public;
grant execute on function public.set_staff_pin(uuid, text) to authenticated;

-- ---------- 4) reset_staff_pin — alias for set_staff_pin for naming clarity
-- (single-step reset flow per the spec decision)
create or replace function public.reset_staff_pin(
  p_user_id uuid,
  p_pin     text
) returns void
language sql
security definer
set search_path = public
as $$
  select public.set_staff_pin(p_user_id, p_pin);
$$;

revoke all on function public.reset_staff_pin(uuid, text) from public;
grant execute on function public.reset_staff_pin(uuid, text) to authenticated;

-- ---------- 5) disable_staff_pin — clears the PIN without replacing it.
-- Used when offboarding staff. The staff_pins row stays for audit.
create or replace function public.disable_staff_pin(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can disable staff PINs' using errcode = '42501';
  end if;

  update public.staff_pins
     set pin_hash         = null,
         failed_attempts  = 0,
         locked_until     = null,
         updated_at       = now()
   where user_id = p_user_id;
end;
$$;

revoke all on function public.disable_staff_pin(uuid) from public;
grant execute on function public.disable_staff_pin(uuid) to authenticated;

-- ---------- 6) record_pin_attempt — internal helper for the Edge Function.
-- Called by service_role from verify-staff-pin. Increments failed_attempts
-- on a miss, resets on a hit, and applies a 15-minute lockout after 5 misses.
create or replace function public.record_pin_attempt(
  p_user_id  uuid,
  p_success  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_success then
    update public.staff_pins
       set last_used_at    = now(),
           failed_attempts = 0,
           locked_until    = null,
           updated_at      = now()
     where user_id = p_user_id;
  else
    update public.staff_pins
       set failed_attempts = failed_attempts + 1,
           locked_until    = case
                               when failed_attempts + 1 >= 5
                                 then now() + interval '15 minutes'
                               else locked_until
                             end,
           updated_at      = now()
     where user_id = p_user_id;
  end if;
end;
$$;

-- Only service_role calls this — revoke from all authenticated and don't grant back.
revoke all on function public.record_pin_attempt(uuid, boolean) from public;
revoke all on function public.record_pin_attempt(uuid, boolean) from authenticated;
grant execute on function public.record_pin_attempt(uuid, boolean) to service_role;

-- ---------- 7) close_expired_pin_shifts — auto-closes shifts whose
-- opener's PIN session has been open for more than 24h.
create or replace function public.close_expired_pin_shifts()
returns int  -- count of shifts closed
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_shift record;
begin
  -- Caller restriction: owner/partner or service_role (for scheduled sweeps).
  -- service_role bypasses RLS / role check entirely, so the explicit check
  -- only applies when called from authenticated sessions.
  if current_user_role() is not null
     and current_user_role() not in ('owner','partner') then
    raise exception 'only owner / partner / scheduler can close expired shifts'
      using errcode = '42501';
  end if;

  for v_shift in
    select id, pin_entered_at, staff_user_id
      from public.pos_shifts
     where closed_at is null
       and deleted_at is null
       and opened_via_pin = true
       and pin_entered_at is not null
       and pin_entered_at < now() - interval '24 hours'
  loop
    update public.pos_shifts
       set closed_at          = v_shift.pin_entered_at + interval '24 hours',
           auto_closed_reason = 'pin_session_expired',
           updated_at         = now()
     where id = v_shift.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.close_expired_pin_shifts() from public;
grant execute on function public.close_expired_pin_shifts() to authenticated;
grant execute on function public.close_expired_pin_shifts() to service_role;

-- ---------- 8) helper view for the Settings → Team PIN column
-- Returns one row per staff user with their PIN status. Owner/Partner read this.
create or replace view public.staff_pin_status as
  select
    sp.user_id,
    tm.display_name,
    case
      when sp.pin_hash is null then 'unset'::text
      when sp.locked_until is not null and sp.locked_until > now() then 'locked'::text
      else 'set'::text
    end as status,
    sp.set_at,
    sp.set_by_user_id,
    sp.last_used_at,
    sp.failed_attempts,
    sp.locked_until
  from public.user_roles ur
  join public.team_members tm on tm.user_id = ur.user_id
  left join public.staff_pins sp on sp.user_id = ur.user_id
  where ur.role = 'staff'
    and tm.deleted_at is null;

alter view public.staff_pin_status set (security_invoker = true);

-- ---------- 9) audit trigger on staff_pins
drop trigger if exists staff_pins_audit on public.staff_pins;
create trigger staff_pins_audit after insert or update or delete on public.staff_pins
  for each row execute function public.audit_trigger();
