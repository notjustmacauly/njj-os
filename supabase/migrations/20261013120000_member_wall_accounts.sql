-- =================================================================
-- Member accounts (website customers) + the member wall.
--
-- Supabase only issues `anon` / `authenticated` logins, so customers and
-- staff share the `authenticated` role. The wall is a PostgREST pre-request
-- gatekeeper (public.check_request): every Data API call by a signed-in user
-- WITHOUT a staff role (no user_roles row) may only reach an allow-list of
-- website + member endpoints; anything else is refused with 403. Staff,
-- anon and server (service_role) requests pass straight through.
-- This sits on top of the NULL-safe role checks (20261005090000).
--
--  member_profiles      name + mobile for a customer login (own row only).
--  member_me()          profile + passes + orders, matched by the login's
--                       VERIFIED email, so past guest purchases attach.
--  member_save_profile  update own name / mobile.
-- =================================================================

-- 1) Profiles --------------------------------------------------------------
create table if not exists public.member_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.member_profiles enable row level security;
drop policy if exists member_profiles_own on public.member_profiles;
create policy member_profiles_own on public.member_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists member_profiles_staff_read on public.member_profiles;
create policy member_profiles_staff_read on public.member_profiles for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager'));

-- 2) Member data ------------------------------------------------------------
create or replace function public.member_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_user  record;
  v_email text;
  v_prof  record;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select id, email, email_confirmed_at, raw_user_meta_data into v_user from auth.users where id = v_uid;
  if not found then
    raise exception 'Account not found.' using errcode = '42501';
  end if;

  -- First visit: create the profile from what they gave at sign-up.
  insert into public.member_profiles (user_id, full_name, phone)
  values (v_uid,
          nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
          nullif(trim(v_user.raw_user_meta_data->>'phone'), ''))
  on conflict (user_id) do nothing;
  select * into v_prof from public.member_profiles where user_id = v_uid;

  -- Purchases only attach once the email is proven to be theirs.
  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  return jsonb_build_object(
    'email', v_user.email,
    'email_confirmed', v_user.email_confirmed_at is not null,
    'is_staff', exists (select 1 from public.user_roles where user_id = v_uid),
    'full_name', v_prof.full_name,
    'phone', v_prof.phone,
    'passes', coalesce((
      select jsonb_agg(p order by p->>'event_date', p->>'code')
      from (
        select jsonb_build_object(
          'code', t.external_id,
          'sport', t.ticket_type_name,
          'event_name', coalesce(e.name, t.event_name),
          'event_slug', e.slug,
          'event_date', t.event_date,
          'start_time', e.start_time,
          'end_time', e.end_time,
          'venue', coalesce(v.name, e.venue),
          'checked_in', t.checked_in_at is not null,
          'receipt_token', c.public_token,
          'verified', c.payment_verification = 'verified'
        ) as p
        from public.tickets t
        left join public.events e on e.id = t.event_id
        left join public.venues v on v.id = e.venue_id
        left join public.web_checkouts c on c.id = t.web_checkout_id
        where v_email is not null
          and lower(t.buyer_email) = v_email
          and t.pass_token is not null
          and t.deleted_at is null
          and t.payment_status <> 'Refunded'
      ) s
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(o order by o->>'created_at' desc)
      from (
        select jsonb_build_object(
          'reference', c.reference,
          'created_at', c.created_at,
          'total', c.total,
          'items', c.items,
          'status', c.payment_verification,
          'receipt_token', c.public_token,
          'next_delivery', (
            select min(od.delivery_date) from public.orders od
            where od.web_checkout_id = c.id and od.fulfillment_status not in ('Delivered','Cancelled')
          )
        ) as o
        from public.web_checkouts c
        where v_email is not null and c.kind = 'shop' and lower(c.customer_email) = v_email
      ) s
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.member_me() from public, anon;
grant execute on function public.member_me() to authenticated;

create or replace function public.member_save_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.member_profiles (user_id, full_name, phone, updated_at)
  values (auth.uid(), nullif(trim(p_full_name), ''), nullif(trim(p_phone), ''), now())
  on conflict (user_id) do update
    set full_name = excluded.full_name, phone = excluded.phone, updated_at = now();
end;
$$;
revoke all on function public.member_save_profile(text, text) from public, anon;
grant execute on function public.member_save_profile(text, text) to authenticated;

-- 3) The wall: Data API gatekeeper --------------------------------------------
create or replace function public.check_request()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_uid     uuid;
  v_path    text;
  v_allowed boolean := true;
begin
  begin
    v_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
    -- Only signed-in users are gated; anon is controlled by grants and the
    -- server's service_role key is trusted.
    if v_role is distinct from 'authenticated' then
      return;
    end if;
    v_uid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
    if v_uid is not null and exists (select 1 from public.user_roles where user_id = v_uid) then
      return; -- staff: unrestricted (their own role checks still apply)
    end if;

    v_path := ltrim(coalesce(current_setting('request.path', true), ''), '/');
    v_path := regexp_replace(v_path, '^rest/v1/', '');
    v_allowed := v_path in (
      -- public website data
      'web_catalog', 'web_flavors', 'web_events', 'venues',
      -- the customer's own account
      'member_profiles', 'rpc/member_me', 'rpc/member_save_profile',
      -- checkout + receipts (same endpoints guests use)
      'rpc/web_place_checkout', 'rpc/web_place_pass_checkout', 'rpc/web_get_checkout', 'rpc/web_mark_checkout_email',
      -- own-role lookup used by shared layouts (returns nothing for customers)
      'user_roles'
    );
  exception when others then
    -- Never let a bug in the gate take the API down for staff; the role
    -- checks inside every function remain the backstop.
    return;
  end;

  if not v_allowed then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'member_wall', 'message', 'This account can''t access that.')::text,
      detail = json_build_object('status', 403)::text;
  end if;
end;
$$;
revoke all on function public.check_request() from public;
grant execute on function public.check_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';
