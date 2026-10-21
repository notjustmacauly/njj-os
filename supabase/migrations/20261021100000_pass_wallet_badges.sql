-- =================================================================
-- Flat-price passes, the 4-pass wallet, book-for-a-friend, and leaderboard
-- badges (21 Oct 2026).
--
--  web_pass_settings    one row: ₱255 per pass, 4-pass bundle ₱980. Every
--                       event's pass_price is kept in sync with it.
--  pass_wallet          signed-in members' pass credits (+4 per bundle, -1
--                       per pass used). Never expire. A rejected payment
--                       reverses that checkout's wallet entries.
--  tickets              + holder_email / holder_user_id: who the pass is
--                       for. A friend's pass links to their account by email
--                       (now or when they sign up); staff can link by hand.
--  web_place_pass_checkout   per-pass holders, wallet use, optional bundle
--                       purchase in the same checkout, bundle-only checkouts.
--  web_badges           public badge rows per sport, season and player.
-- =================================================================

-- 1) Prices --------------------------------------------------------------------
create table if not exists public.web_pass_settings (
  id            boolean primary key default true check (id),
  pass_price    numeric(12,2) not null default 255 check (pass_price >= 0),
  bundle_size   integer not null default 4 check (bundle_size between 2 and 20),
  bundle_price  numeric(12,2) not null default 980 check (bundle_price >= 0),
  updated_at    timestamptz not null default now()
);
insert into public.web_pass_settings (id) values (true) on conflict (id) do nothing;
alter table public.web_pass_settings enable row level security;
drop policy if exists web_pass_settings_staff on public.web_pass_settings;
create policy web_pass_settings_staff on public.web_pass_settings for all to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'))
  with check (coalesce(public.current_user_role()::text, '') in ('owner', 'partner'));

create or replace function public.web_pass_prices() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pass_price', pass_price, 'bundle_size', bundle_size, 'bundle_price', bundle_price)
  from web_pass_settings where id
$$;
grant execute on function public.web_pass_prices() to anon, authenticated;

-- Every event uses the one price.
create or replace function public.events_flat_pass_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.pass_price := (select pass_price from web_pass_settings where id);
  return new;
end $$;
drop trigger if exists events_flat_pass_price on public.events;
create trigger events_flat_pass_price before insert or update of pass_price on public.events
  for each row execute function public.events_flat_pass_price();
update public.events set pass_price = (select pass_price from public.web_pass_settings where id) where true;
alter table public.events alter column pass_price set default 255;

create or replace function public.web_pass_settings_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update events set pass_price = new.pass_price where pass_price is distinct from new.pass_price;
  return new;
end $$;
drop trigger if exists web_pass_settings_sync on public.web_pass_settings;
create trigger web_pass_settings_sync after update of pass_price on public.web_pass_settings
  for each row execute function public.web_pass_settings_sync();

-- 2) Who a pass is for ---------------------------------------------------------
alter table public.tickets
  add column if not exists holder_email   text,
  add column if not exists holder_user_id uuid references auth.users(id);
create index if not exists tickets_holder_email_idx on public.tickets (lower(holder_email)) where holder_email is not null;
create index if not exists tickets_holder_user_idx on public.tickets (holder_user_id) where holder_user_id is not null;

-- 3) Wallet ----------------------------------------------------------------------
create table if not exists public.pass_wallet (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  delta           integer not null check (delta <> 0),
  kind            text not null check (kind in ('bundle', 'redeem', 'reversal', 'staff')),
  web_checkout_id uuid references public.web_checkouts(id),
  ticket_id       uuid references public.tickets(id),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists pass_wallet_user_idx on public.pass_wallet (user_id, created_at desc);
alter table public.pass_wallet enable row level security;
drop policy if exists pass_wallet_staff on public.pass_wallet;
create policy pass_wallet_staff on public.pass_wallet for select to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'));

create or replace function public.pass_wallet_balance(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from pass_wallet where user_id = p_user
$$;
revoke all on function public.pass_wallet_balance(uuid) from public, anon, authenticated;

-- A rejected payment takes back what that checkout put in or took out.
create or replace function public.pass_wallet_on_reject() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_verification = 'rejected' and old.payment_verification is distinct from 'rejected' then
    insert into pass_wallet (user_id, delta, kind, web_checkout_id, note)
    select user_id, -sum(delta), 'reversal', new.id, 'Payment rejected for ' || new.reference
    from pass_wallet where web_checkout_id = new.id and kind <> 'reversal'
    group by user_id having sum(delta) <> 0;
  end if;
  return new;
end $$;
drop trigger if exists pass_wallet_on_reject on public.web_checkouts;
create trigger pass_wallet_on_reject after update of payment_verification on public.web_checkouts
  for each row execute function public.pass_wallet_on_reject();

-- Staff: add or remove passes by hand (with a reason).
create or replace function public.staff_adjust_wallet(p_email text, p_delta integer, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('owner', 'partner', 'manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_delta = 0 or nullif(trim(p_note), '') is null then raise exception 'Give a number of passes and a reason.' using errcode = '22023'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_uid is null then raise exception 'No verified account with that email.' using errcode = '22023'; end if;
  insert into pass_wallet (user_id, delta, kind, note, created_by) values (v_uid, p_delta, 'staff', trim(p_note), auth.uid());
  return pass_wallet_balance(v_uid);
end $$;
revoke all on function public.staff_adjust_wallet(text, integer, text) from public, anon;
grant execute on function public.staff_adjust_wallet(text, integer, text) to authenticated;

-- Staff: link a pass to a player's account (or just fix the name).
create or replace function public.staff_link_ticket_holder(p_ticket uuid, p_name text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_email text := lower(nullif(trim(p_email), ''));
begin
  if coalesce(current_user_role()::text, '') not in ('owner', 'partner', 'manager', 'staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if v_email is not null then
    select id into v_uid from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  end if;
  update tickets
     set holder_name = coalesce(nullif(trim(p_name), ''), holder_name),
         holder_email = v_email, holder_user_id = v_uid
   where id = p_ticket and pass_token is not null;
  if not found then raise exception 'Pass not found.' using errcode = '22023'; end if;
  return jsonb_build_object('linked', v_uid is not null);
end $$;
revoke all on function public.staff_link_ticket_holder(uuid, text, text) from public, anon;
grant execute on function public.staff_link_ticket_holder(uuid, text, text) to authenticated;

-- 4) Checkout --------------------------------------------------------------------
create or replace function public.web_place_pass_checkout(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_key      text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_name     text := nullif(trim(p_payload->>'name'), '');
  v_email    text := lower(nullif(trim(p_payload->>'email'), ''));
  v_phone    text := nullif(trim(p_payload->>'phone'), '');
  v_proof    text := nullif(p_payload->>'proof_path', '');
  v_sha      text := nullif(p_payload->>'proof_sha256', '');
  v_paddles  int  := coalesce(nullif(p_payload->>'paddles', '')::int, 0);
  v_use      int  := coalesce(nullif(p_payload->>'use_wallet', '')::int, 0);
  v_bundles  int  := coalesce(nullif(p_payload->>'bundles', '')::int, 0);
  v_uid      uuid := auth.uid();
  v_member   boolean := false;
  v_set      record;
  v_existing record;
  v_event    record;
  v_event_id uuid;
  v_paddle_price numeric(12,2) := 0;
  v_sport    record;
  v_h        jsonb;
  v_holders  jsonb := '[]'::jsonb;
  v_count    int := 0;
  v_cash     int;
  v_from_b   int;
  v_pay      int;
  v_items    jsonb := '[]'::jsonb;
  v_total    numeric(12,2) := 0;
  v_flags    jsonb := '[]'::jsonb;
  v_ref      text;
  v_checkout uuid;
  v_token    uuid;
  v_ticket   uuid;
  v_hname    text;
  v_hemail   text;
  v_huid     uuid;
  v_credit   int;
  n          int := 0;
  i          int;
begin
  if v_key is not null then
    select reference, public_token into v_existing from public.web_checkouts where idempotency_key = v_key;
    if found then
      return jsonb_build_object('reference', v_existing.reference, 'token', v_existing.public_token, 'replayed', true);
    end if;
  end if;
  select * into v_set from web_pass_settings where id;

  -- Signed-in member (verified email) = may use or buy wallet passes.
  if v_uid is not null then
    select exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) into v_member;
    if v_member and v_email is null then
      select lower(email) into v_email from auth.users where id = v_uid;
    end if;
  end if;

  if v_name is null or v_email is null or v_phone is null then
    raise exception 'Please fill in your name, email and mobile number.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if (v_use > 0 or v_bundles > 0) and not v_member then
    raise exception 'Sign in to use or buy a pass bundle.' using errcode = '22023';
  end if;
  if v_use < 0 or v_bundles < 0 or v_bundles > 5 then
    raise exception 'Invalid bundle quantity.' using errcode = '22023';
  end if;

  -- Passes: one holder per pass. (Older clients send passes[{sport_id, qty}].)
  v_holders := coalesce(p_payload->'holders', '[]'::jsonb);
  if jsonb_array_length(v_holders) = 0 then
    for v_h in select * from jsonb_array_elements(coalesce(p_payload->'passes', '[]'::jsonb)) loop
      for i in 1..least(greatest(coalesce((v_h->>'qty')::int, 0), 0), 20) loop
        v_holders := v_holders || jsonb_build_object('sport_id', v_h->>'sport_id');
      end loop;
    end loop;
  end if;
  v_count := jsonb_array_length(v_holders);
  if v_count > 20 then raise exception 'That''s a lot of passes. Book 20 or fewer at a time.' using errcode = '22023'; end if;

  if v_count > 0 then
    select e.*, coalesce(vn.name, e.venue) as venue_name into v_event
      from public.events e left join public.venues vn on vn.id = e.venue_id
     where e.id = nullif(p_payload->>'event_id', '')::uuid
       and e.status = 'published' and e.deleted_at is null and e.event_date >= v_today
     for update of e;
    if not found then
      raise exception 'This event is no longer available.' using errcode = '22023';
    end if;
    if v_paddles < 0 or v_paddles > 20 or (v_paddles > 0 and v_event.paddle_price is null) then
      raise exception 'Invalid paddle rental quantity.' using errcode = '22023';
    end if;
    v_event_id := v_event.id;
    v_paddle_price := coalesce(v_event.paddle_price, 0);
    -- Capacity per sport.
    for v_sport in
      select s.*, count(*) as want
      from jsonb_array_elements(v_holders) h
      join public.event_sports s on s.id = nullif(h->>'sport_id', '')::uuid and s.event_id = v_event.id
      group by s.id
    loop
      if v_sport.capacity - public.event_sport_sold(v_sport.id) < v_sport.want then
        raise exception 'Sorry, only % spot(s) left for %.',
          greatest(v_sport.capacity - public.event_sport_sold(v_sport.id), 0), v_sport.name using errcode = '22023';
      end if;
      n := n + v_sport.want;
    end loop;
    if n <> v_count then raise exception 'Unknown sport for this event.' using errcode = '22023'; end if;
  elsif v_bundles = 0 then
    raise exception 'Choose at least one pass.' using errcode = '22023';
  else
    v_paddles := 0; -- bundle-only checkout: no event, no rentals
  end if;

  if v_use > v_count then v_use := v_count; end if;
  if v_use > 0 and pass_wallet_balance(v_uid) < v_use then
    raise exception 'You only have % pass(es) in your wallet.', pass_wallet_balance(v_uid) using errcode = '22023';
  end if;

  -- What gets paid: bundles first cover the passes not paid from the wallet.
  v_cash   := v_count - v_use;
  v_from_b := least(v_cash, v_bundles * v_set.bundle_size);
  v_pay    := v_cash - v_from_b;
  v_total  := v_pay * v_set.pass_price + v_bundles * v_set.bundle_price + v_paddles * v_paddle_price;

  for v_sport in
    select s.id, s.name, count(*)::int as qty
    from jsonb_array_elements(v_holders) h join public.event_sports s on s.id = nullif(h->>'sport_id', '')::uuid
    group by s.id, s.name order by s.name
  loop
    v_items := v_items || jsonb_build_object('kind', 'pass', 'sport_id', v_sport.id, 'name', v_sport.name, 'qty', v_sport.qty, 'price', v_set.pass_price);
  end loop;
  if v_bundles > 0 then
    v_items := v_items || jsonb_build_object('kind', 'bundle', 'name', v_set.bundle_size || '-pass bundle', 'qty', v_bundles, 'price', v_set.bundle_price);
  end if;
  if v_from_b > 0 then
    v_items := v_items || jsonb_build_object('kind', 'credit', 'name', 'Passes from the bundle', 'qty', v_from_b, 'price', -v_set.pass_price);
  end if;
  if v_use > 0 then
    v_items := v_items || jsonb_build_object('kind', 'credit', 'name', 'Passes from your wallet', 'qty', v_use, 'price', -v_set.pass_price);
  end if;
  if v_paddles > 0 then
    v_items := v_items || jsonb_build_object('kind', 'paddle', 'name', 'Paddle rental', 'qty', v_paddles, 'price', v_paddle_price);
  end if;

  if v_total > 0 and (v_proof is null or not exists (
    select 1 from storage.objects where bucket_id = 'web-payment-proofs' and name = v_proof
  )) then
    raise exception 'Please upload your payment screenshot.' using errcode = '22023';
  end if;

  if v_sha is not null and exists (select 1 from public.web_checkouts where proof_sha256 = v_sha) then
    v_flags := v_flags || '"duplicate_screenshot"'::jsonb;
  end if;
  if v_total > 0 and not exists (select 1 from public.web_checkouts where lower(customer_email) = v_email and payment_verification = 'verified') then
    v_flags := v_flags || '"first_time_customer"'::jsonb;
  end if;
  if v_total >= 5000 then
    v_flags := v_flags || '"high_value"'::jsonb;
  end if;

  v_ref := 'NJ-' || to_char(v_today, 'YYMMDD') || '-' || lpad(nextval('public.web_checkout_ref_seq')::text, 3, '0');
  insert into public.web_checkouts (
    reference, idempotency_key, kind, event_id, customer_name, customer_email, customer_phone,
    items, subtotal, delivery_total, total, proof_path, proof_sha256, flags, payment_verification
  ) values (
    v_ref, v_key, 'passes', v_event_id, v_name, v_email, v_phone,
    v_items, v_total, 0, v_total, v_proof, v_sha, v_flags,
    -- Nothing to pay (all from the wallet) = nothing to verify.
    case when v_total > 0 then 'unverified' else 'verified' end
  ) returning id, public_token into v_checkout, v_token;

  if v_bundles > 0 then
    insert into pass_wallet (user_id, delta, kind, web_checkout_id, note)
    values (v_uid, v_bundles * v_set.bundle_size, 'bundle', v_checkout, v_ref);
  end if;

  i := 0;
  for v_h in select * from jsonb_array_elements(v_holders) loop
    i := i + 1;
    -- The first pass with no name is the buyer's own.
    v_hname  := nullif(trim(v_h->>'name'), '');
    v_hemail := lower(nullif(trim(v_h->>'email'), ''));
    if v_hname is null then v_hname := v_name; v_hemail := coalesce(v_hemail, v_email); end if;
    v_huid := null;
    if v_hemail is not null then
      select id into v_huid from auth.users where lower(email) = v_hemail and email_confirmed_at is not null;
    end if;
    select name into v_sport from event_sports where id = (v_h->>'sport_id')::uuid;
    insert into public.tickets (
      external_id, source, ticket_type_name, event_name, event_date, order_date,
      buyer_name, buyer_email, unit_price, payment_status, notes,
      event_id, event_sport_id, web_checkout_id, pass_token, holder_name, holder_email, holder_user_id
    ) values (
      'WTKT-' || to_char(v_today, 'YYMMDD') || '-' || public.pad_min3(nextval('public.tickets_online_external_id_seq')),
      'online', v_sport.name, v_event.name, v_event.event_date, v_today,
      v_name, v_email, case when i <= v_use + v_from_b then 0 else v_set.pass_price end, 'Paid',
      'Website ' || v_ref || case when v_total > 0 then ' (unverified)' else '' end
        || case when i <= v_use then ' · wallet pass' when i <= v_use + v_from_b then ' · bundle pass' else '' end,
      v_event.id, (v_h->>'sport_id')::uuid, v_checkout, gen_random_uuid(), v_hname, v_hemail, v_huid
    ) returning id into v_ticket;
    if i <= v_use + v_from_b then
      insert into pass_wallet (user_id, delta, kind, web_checkout_id, ticket_id, note)
      values (v_uid, -1, 'redeem', v_checkout, v_ticket, v_ref);
    end if;
  end loop;

  for i in 1..v_paddles loop
    insert into public.tickets (
      external_id, source, ticket_type_code, ticket_type_name, event_name, event_date, order_date,
      buyer_name, buyer_email, unit_price, payment_status, notes, event_id, web_checkout_id
    ) values (
      'WTKT-' || to_char(v_today, 'YYMMDD') || '-' || public.pad_min3(nextval('public.tickets_online_external_id_seq')),
      'online', case when exists (select 1 from public.ticket_types where code = 'RENT-PADDLE') then 'RENT-PADDLE' end,
      'Paddle rental', v_event.name, v_event.event_date, v_today,
      v_name, v_email, v_event.paddle_price, 'Paid', 'Website ' || v_ref || ' (unverified)',
      v_event.id, v_checkout
    );
  end loop;

  if v_total > 0 then
    perform public.ledger_apply(
      p_account_code := 'Unverified Receipts', p_direction := 'in', p_amount := v_total,
      p_ref_type := 'web_checkout', p_ref_id := v_checkout, p_ref_external_id := v_ref,
      p_description := 'Website ' || v_ref || case when v_count > 0 then ' · event passes' else ' · pass bundle' end || ' (unverified)',
      p_idempotency_key := 'web-checkout-paid-' || v_checkout::text
    );
  end if;

  return jsonb_build_object('reference', v_ref, 'token', v_token, 'total', v_total);
end;
$function$;

-- Receipt: who each pass is for.
create or replace function public.web_get_checkout(p_token uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'kind', c.kind,
    'reference', c.reference,
    'name', c.customer_name,
    'email', c.customer_email,
    'address', c.delivery_address,
    'items', c.items,
    'subtotal', c.subtotal,
    'delivery_total', c.delivery_total,
    'total', c.total,
    'status', c.payment_verification,
    'created_at', c.created_at,
    'deliveries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', o.delivery_date, 'reference', o.external_id,
        'pcl', o.pcl_qty, 'acg', o.acg_qty, 'wpm', o.wpm_qty,
        'status', o.fulfillment_status) order by o.delivery_date), '[]'::jsonb)
      from public.orders o where o.web_checkout_id = c.id
    ),
    'event', (
      select jsonb_build_object('name', e.name, 'slug', e.slug, 'date', e.event_date,
        'start_time', e.start_time, 'end_time', e.end_time,
        'venue', coalesce(v.name, e.venue), 'maps_url', v.maps_url, 'image', e.cover_image_url)
      from public.events e left join public.venues v on v.id = e.venue_id where e.id = c.event_id
    ),
    'passes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', t.external_id, 'sport', t.ticket_type_name, 'token', t.pass_token,
        'holder', t.holder_name, 'checked_in', t.checked_in_at is not null) order by t.external_id), '[]'::jsonb)
      from public.tickets t
      where t.web_checkout_id = c.id and t.pass_token is not null and t.deleted_at is null
    ),
    'bundle_passes', (select coalesce(sum(delta), 0) from public.pass_wallet w where w.web_checkout_id = c.id and w.kind = 'bundle')
  )
  from public.web_checkouts c
  where c.public_token = p_token
$function$;

-- 5) Member account ------------------------------------------------------------------
create or replace function public.member_me()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_user  record;
  v_email text;
  v_prof  record;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select id, email, email_confirmed_at, raw_user_meta_data, created_at into v_user from auth.users where id = v_uid;
  if not found then
    raise exception 'Account not found.' using errcode = '42501';
  end if;

  insert into public.member_profiles (user_id, full_name, phone)
  values (v_uid,
          nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
          nullif(trim(v_user.raw_user_meta_data->>'phone'), ''))
  on conflict (user_id) do nothing;
  select * into v_prof from public.member_profiles where user_id = v_uid;

  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  -- Passes a friend booked for this email link to the account automatically.
  if v_email is not null then
    update public.tickets set holder_user_id = v_uid
     where holder_user_id is null and lower(holder_email) = v_email and pass_token is not null;
  end if;

  return jsonb_build_object(
    'email', v_user.email,
    'email_confirmed', v_user.email_confirmed_at is not null,
    'member_since', v_user.created_at,
    'is_staff', exists (select 1 from public.user_roles where user_id = v_uid),
    'full_name', v_prof.full_name,
    'phone', v_prof.phone,
    'wallet', public.pass_wallet_balance(v_uid),
    'wallet_history', coalesce((
      select jsonb_agg(jsonb_build_object('delta', w.delta, 'kind', w.kind, 'note', w.note, 'at', w.created_at) order by w.created_at desc)
      from (select * from public.pass_wallet where user_id = v_uid order by created_at desc limit 20) w
    ), '[]'::jsonb),
    'passes', coalesce((
      select jsonb_agg(p order by p->>'event_date', p->>'code')
      from (
        select jsonb_build_object(
          'code', t.external_id,
          'sport', t.ticket_type_name,
          'holder', t.holder_name,
          'for_me', (t.holder_user_id = v_uid or lower(coalesce(t.holder_email, t.buyer_email)) = v_email),
          'booked_by_me', lower(t.buyer_email) = v_email,
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
          and (lower(t.buyer_email) = v_email or lower(t.holder_email) = v_email or t.holder_user_id = v_uid)
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
$function$;

-- 6) Badges ----------------------------------------------------------------------------
-- One row per (sport, season, player, badge). Champion crowns are permanent:
-- they come from closed seasons and show in every season.
create or replace view public.web_badges
with (security_invoker = false) as
  with cur as (select public.rr_season_of((now() at time zone 'Asia/Manila')::date) as season),
  ev as (
    select 'badminton'::text as sport, season, session_id, player_id, n, w, (n - w) as l, 0 as d
    from rr_event_player where status = 'finalized' and season is not null and n > 0
    union all
    select 'volleyball', season, session_id, player_id, n, w, l, d
    from vb_event_player where status = 'finalized' and season is not null and n > 0
  ),
  tables as (
    select sport, season, player_id, rank, provisional, coalesce(eligible, false) as eligible from web_rr_season
    union all
    select sport, season, player_id, rank, provisional, false from web_vb_season
  ),
  per as (
    select sport, season, player_id, count(*) as events,
           bool_or(n >= 3 and l = 0 and d = 0) as unbeaten
    from ev group by sport, season, player_id
  ),
  lifetime as (select sport, player_id, count(*) as events from ev group by sport, player_id),
  most as (select sport, season, max(events) as top from per group by sport, season),
  results as (
    select 'badminton'::text as sport, public.rr_season_of(gs.session_date) as season, p.pid as player_id,
           gm.started_at as ts,
           ((gm.winner = 'a') = (p.pid = any(gm.team_a))) as won
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'rally_rank' and gs.status = 'finalized'
    cross join lateral unnest(gm.team_a || gm.team_b) as p(pid)
    where gm.status = 'done' and gm.winner is not null
    union all
    select 'volleyball', public.rr_season_of(gs.session_date), p.pid,
           gs.created_at + make_interval(secs => gm.game_no),
           (not gm.is_draw and (gm.winner = 'a') = (p.pid = any(gm.team_a)))
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'spike_chill' and gs.status = 'finalized'
    cross join lateral unnest(gm.team_a || gm.team_b) as p(pid)
    where gm.status = 'done' and gm.outcome in ('played', 'timed', 'forfeit')
  ),
  ordered as (
    select sport, season, player_id, won, row_number() over (partition by sport, season, player_id order by ts desc) as rn
    from results where season is not null
  ),
  streaks as (
    select sport, season, player_id,
           coalesce(min(rn) filter (where not won) - 1, count(*)) as streak
    from ordered group by sport, season, player_id
  ),
  gains as (
    -- Rating gained since the player's first game of the season.
    select 'badminton'::text as sport, public.rr_season_of(gs.session_date) as season, l.player_id,
           (select p.rating from game_players p where p.id = l.player_id) - (array_agg(l.prior order by l.seq))[1] as gain
    from rr_rating_ledger l join game_matches gm on gm.id = l.match_id join game_sessions gs on gs.id = gm.session_id
    where gs.status = 'finalized'
    group by 1, 2, l.player_id
    union all
    select 'volleyball', public.rr_season_of(gs.session_date), l.player_id,
           (select r.rating from game_sport_ratings r where r.player_id = l.player_id and r.sport = 'volleyball') - (array_agg(l.prior order by l.seq))[1]
    from vb_rating_ledger l join game_matches gm on gm.id = l.match_id join game_sessions gs on gs.id = gm.session_id
    where gs.status = 'finalized'
    group by 1, 2, l.player_id
  ),
  top_gain as (
    select distinct on (sport, season) sport, season, player_id, gain
    from gains where season is not null and gain > 0
    order by sport, season, gain desc, player_id
  ),
  champs as (
    select t.sport, t.season as won_season, t.player_id from tables t, cur
    where t.rank = 1 and t.season < coalesce(cur.season, 1)
  )
  select t.sport, t.season, t.player_id, b.badge, b.detail
  from tables t
  join per on per.sport = t.sport and per.season = t.season and per.player_id = t.player_id
  left join lifetime lt on lt.sport = t.sport and lt.player_id = t.player_id
  left join most on most.sport = t.sport and most.season = t.season
  left join streaks s on s.sport = t.sport and s.season = t.season and s.player_id = t.player_id
  cross join lateral (values
    ('podium', case when t.rank <= 3 then t.rank::text end),
    ('on_fire', case when s.streak >= 3 then s.streak::text end),
    ('unbeaten', case when per.unbeaten then '' end),
    ('regular', case when per.events >= 4 then per.events::text end),
    ('iron', case when per.events >= 2 and per.events = most.top then per.events::text end),
    ('first_event', case when lt.events = 1 then '' end),
    ('rising', case when exists (select 1 from top_gain g where g.sport = t.sport and g.season = t.season and g.player_id = t.player_id)
                    then (select round(g.gain, 2)::text from top_gain g where g.sport = t.sport and g.season = t.season and g.player_id = t.player_id) end),
    ('eligible', case when t.eligible then '' end),
    ('provisional', case when t.provisional then '' end)
  ) as b(badge, detail)
  where b.detail is not null
  union all
  select c.sport, t.season, c.player_id, 'champion', c.won_season::text
  from champs c join tables t on t.sport = c.sport and t.player_id = c.player_id;
revoke all on public.web_badges from public;
grant select on public.web_badges to anon, authenticated;

-- Member wall: let signed-in customers read prices and badges.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.check_request()'::regprocedure);
  if position('web_badges' in v_def) = 0 then
    v_def := replace(v_def, $a$'web_rr_season',$a$, $b$'web_rr_season', 'web_badges', 'rpc/web_pass_prices',$b$);
    if position('web_badges' in v_def) = 0 then
      raise exception 'check_request allow-list not found; nothing changed';
    end if;
    execute v_def;
  end if;
end $$;

-- Member standings now carry player_id (so the account page can show badges).
drop function if exists public.member_standings();
create function public.member_standings()
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select p.id from game_players p
    join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
    where p.email is not null and lower(p.email) = lower(u.email)
  ),
  standings as (
    select l.sport, l.season, l.player_id, l.rank, l.lp, l.wins, l.matches, l.events, l.rating, l.provisional,
           (select count(*) from web_rr_season x where x.sport = l.sport and x.season = l.season) as of
    from web_rr_season l where l.player_id in (select id from mine)
    union all
    select l.sport, l.season, l.player_id, l.rank, l.lp, l.wins, l.matches, l.events, l.rating, l.provisional,
           (select count(*) from web_vb_season x where x.season = l.season) as of
    from web_vb_season l where l.player_id in (select id from mine)
  )
  select coalesce(jsonb_agg(to_jsonb(standings) order by season desc, sport), '[]'::jsonb) from standings
$$;
revoke all on function public.member_standings() from public, anon;
grant execute on function public.member_standings() to authenticated;
