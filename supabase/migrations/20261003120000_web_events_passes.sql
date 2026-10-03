-- =================================================================
-- Website — Phase C: events + online passes.
--
--  venues          regular venues (one tap in the event form).
--  events          + series, venue_id, pass_price (₱250), paddle_price (₱50,
--                  null = no add-on). Staff manage; anon reads web_events.
--  event_sports    the sports an event offers, each with its own capacity.
--                  One pass = one sport at one event.
--  bucket event-images  public read, staff upload.
--  tickets         + 'online' source, event_id, event_sport_id,
--                  web_checkout_id, pass_token (QR), holder_name.
--  web_checkouts   + kind ('shop' | 'passes'); delivery fields optional.
--  web_place_pass_checkout  anon: validates capacity, creates one ticket
--                  per pass (+ paddle rentals), posts the total to
--                  Unverified Receipts (ref_type 'web_checkout').
--  web_review_checkout   now also verifies / rejects pass checkouts.
--  web_get_checkout      now also returns the event + pass tokens.
-- =================================================================

-- (the 'online' ticket_source value is added in 20261003115900 — enum values
-- must be committed before use)

-- 1) Venues ------------------------------------------------------------
create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  address    text,
  maps_url   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.venues enable row level security;
drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select to anon, authenticated using (true);
drop policy if exists venues_manage on public.venues;
create policy venues_manage on public.venues for all to authenticated
  using (public.current_user_role() in ('owner','partner','manager'))
  with check (public.current_user_role() in ('owner','partner','manager'));

insert into public.venues (name, address, maps_url) values
  ('Game Changer Sports Facility', 'Mandaue City, Cebu',
   'https://www.google.com/maps/search/?api=1&query=Game+Changer+Sports+Facility+Mandaue+City'),
  ('Cebu Sports Hub', 'Mandaue City, Cebu',
   'https://www.google.com/maps/search/?api=1&query=Cebu+Sports+Hub+Mandaue+City')
on conflict (name) do nothing;

-- 2) Events ---------------------------------------------------------------
alter table public.events
  add column if not exists series       text,
  add column if not exists venue_id     uuid references public.venues(id),
  add column if not exists pass_price   numeric(12,2) not null default 250 check (pass_price >= 0),
  add column if not exists paddle_price numeric(12,2) default 50 check (paddle_price is null or paddle_price >= 0);

drop policy if exists events_manage on public.events;
create policy events_manage on public.events for all to authenticated
  using (public.current_user_role() in ('owner','partner','manager'))
  with check (public.current_user_role() in ('owner','partner','manager'));

create table if not exists public.event_sports (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null,
  capacity   integer not null check (capacity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_sports_event_idx on public.event_sports (event_id);
alter table public.event_sports enable row level security;
drop policy if exists event_sports_read on public.event_sports;
create policy event_sports_read on public.event_sports for select to authenticated using (true);
drop policy if exists event_sports_manage on public.event_sports;
create policy event_sports_manage on public.event_sports for all to authenticated
  using (public.current_user_role() in ('owner','partner','manager'))
  with check (public.current_user_role() in ('owner','partner','manager'));

-- 3) Images ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists event_images_staff_write on storage.objects;
create policy event_images_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.current_user_role() in ('owner','partner','manager'));
drop policy if exists event_images_staff_update on storage.objects;
create policy event_images_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and public.current_user_role() in ('owner','partner','manager'));

-- 4) Tickets + checkouts ---------------------------------------------------------
alter table public.tickets
  add column if not exists event_id        uuid references public.events(id),
  add column if not exists event_sport_id  uuid references public.event_sports(id),
  add column if not exists web_checkout_id uuid references public.web_checkouts(id),
  add column if not exists pass_token      uuid unique,
  add column if not exists holder_name     text;
create index if not exists tickets_event_sport_idx on public.tickets (event_sport_id) where deleted_at is null;
create index if not exists tickets_web_checkout_idx on public.tickets (web_checkout_id) where web_checkout_id is not null;

create sequence if not exists public.tickets_online_external_id_seq;

alter table public.web_checkouts
  add column if not exists kind     text not null default 'shop' check (kind in ('shop','passes')),
  add column if not exists event_id uuid references public.events(id);
alter table public.web_checkouts alter column delivery_address drop not null;
alter table public.web_checkouts alter column first_delivery_date drop not null;

-- 5) Public read: published, upcoming events with spots left ------------------------
create or replace function public.event_sport_sold(p_sport_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.tickets
  where event_sport_id = p_sport_id and deleted_at is null and payment_status <> 'Refunded'
$$;
revoke all on function public.event_sport_sold(uuid) from public;
grant execute on function public.event_sport_sold(uuid) to anon, authenticated;

create or replace view public.web_events
with (security_invoker = false) as
  select
    e.id, e.slug, e.name, e.series, e.description, e.cover_image_url,
    e.event_date, e.start_time, e.end_time, e.pass_price, e.paddle_price,
    coalesce(v.name, e.venue) as venue_name, v.address as venue_address, v.maps_url,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'capacity', s.capacity,
        'left', greatest(s.capacity - public.event_sport_sold(s.id), 0)) order by s.sort_order, s.name)
      from public.event_sports s where s.event_id = e.id
    ), '[]'::jsonb) as sports
  from public.events e
  left join public.venues v on v.id = e.venue_id
  where e.status = 'published' and e.deleted_at is null
    and e.event_date >= (now() at time zone 'Asia/Manila')::date;

revoke all on public.web_events from public;
grant select on public.web_events to anon, authenticated;

-- 6) Buy passes ------------------------------------------------------------------------
-- p_payload: { idempotency_key, name, email, phone, event_id, proof_path, proof_sha256,
--              passes: [{ sport_id, qty }], paddles: n }
create or replace function public.web_place_pass_checkout(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_key      text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_name     text := nullif(trim(p_payload->>'name'), '');
  v_email    text := lower(nullif(trim(p_payload->>'email'), ''));
  v_phone    text := nullif(trim(p_payload->>'phone'), '');
  v_proof    text := nullif(p_payload->>'proof_path', '');
  v_sha      text := nullif(p_payload->>'proof_sha256', '');
  v_paddles  int  := coalesce(nullif(p_payload->>'paddles', '')::int, 0);
  v_existing record;
  v_event    record;
  v_sport    record;
  v_pass     jsonb;
  v_qty      int;
  v_count    int := 0;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_total    numeric(12,2);
  v_flags    jsonb := '[]'::jsonb;
  v_ref      text;
  v_checkout uuid;
  v_token    uuid;
  i          int;
begin
  if v_key is not null then
    select reference, public_token into v_existing from public.web_checkouts where idempotency_key = v_key;
    if found then
      return jsonb_build_object('reference', v_existing.reference, 'token', v_existing.public_token, 'replayed', true);
    end if;
  end if;

  if v_name is null or v_email is null or v_phone is null then
    raise exception 'Please fill in your name, email and mobile number.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if v_proof is null or not exists (
    select 1 from storage.objects where bucket_id = 'web-payment-proofs' and name = v_proof
  ) then
    raise exception 'Please upload your payment screenshot.' using errcode = '22023';
  end if;

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

  for v_pass in select * from jsonb_array_elements(coalesce(p_payload->'passes', '[]'::jsonb)) loop
    v_qty := coalesce((v_pass->>'qty')::int, 0);
    if v_qty = 0 then continue; end if;
    if v_qty < 0 or v_qty > 20 then raise exception 'Invalid number of passes.' using errcode = '22023'; end if;
    select * into v_sport from public.event_sports
      where id = nullif(v_pass->>'sport_id', '')::uuid and event_id = v_event.id;
    if not found then raise exception 'Unknown sport for this event.' using errcode = '22023'; end if;
    if v_sport.capacity - public.event_sport_sold(v_sport.id) < v_qty then
      raise exception 'Sorry — only % spot(s) left for %.',
        greatest(v_sport.capacity - public.event_sport_sold(v_sport.id), 0), v_sport.name using errcode = '22023';
    end if;
    v_count := v_count + v_qty;
    v_subtotal := v_subtotal + v_qty * v_event.pass_price;
    v_items := v_items || jsonb_build_object('kind', 'pass', 'sport_id', v_sport.id, 'name', v_sport.name,
                                             'qty', v_qty, 'price', v_event.pass_price);
  end loop;
  if v_count = 0 then
    raise exception 'Choose at least one pass.' using errcode = '22023';
  end if;
  if v_paddles > 0 then
    v_subtotal := v_subtotal + v_paddles * v_event.paddle_price;
    v_items := v_items || jsonb_build_object('kind', 'paddle', 'name', 'Paddle rental',
                                             'qty', v_paddles, 'price', v_event.paddle_price);
  end if;
  v_total := v_subtotal;

  if v_sha is not null and exists (select 1 from public.web_checkouts where proof_sha256 = v_sha) then
    v_flags := v_flags || '"duplicate_screenshot"'::jsonb;
  end if;
  if not exists (select 1 from public.web_checkouts where lower(customer_email) = v_email and payment_verification = 'verified') then
    v_flags := v_flags || '"first_time_customer"'::jsonb;
  end if;
  if v_total >= 5000 then
    v_flags := v_flags || '"high_value"'::jsonb;
  end if;

  v_ref := 'NJ-' || to_char(v_today, 'YYMMDD') || '-' || lpad(nextval('public.web_checkout_ref_seq')::text, 3, '0');
  insert into public.web_checkouts (
    reference, idempotency_key, kind, event_id, customer_name, customer_email, customer_phone,
    items, subtotal, delivery_total, total, proof_path, proof_sha256, flags
  ) values (
    v_ref, v_key, 'passes', v_event.id, v_name, v_email, v_phone,
    v_items, v_subtotal, 0, v_total, v_proof, v_sha, v_flags
  ) returning id, public_token into v_checkout, v_token;

  -- One ticket per pass, each with its own QR token.
  for v_pass in select * from jsonb_array_elements(v_items) where value->>'kind' = 'pass' loop
    for i in 1..(v_pass->>'qty')::int loop
      insert into public.tickets (
        external_id, source, ticket_type_name, event_name, event_date, order_date,
        buyer_name, buyer_email, unit_price, payment_status, notes,
        event_id, event_sport_id, web_checkout_id, pass_token, holder_name
      ) values (
        'WTKT-' || to_char(v_today, 'YYMMDD') || '-' || public.pad_min3(nextval('public.tickets_online_external_id_seq')),
        'online', v_pass->>'name', v_event.name, v_event.event_date, v_today,
        v_name, v_email, v_event.pass_price, 'Paid', 'Website ' || v_ref || ' (unverified)',
        v_event.id, (v_pass->>'sport_id')::uuid, v_checkout, gen_random_uuid(), v_name
      );
    end loop;
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
      p_description := 'Website ' || v_ref || ' · event passes (unverified)',
      p_idempotency_key := 'web-checkout-paid-' || v_checkout::text
    );
  end if;

  return jsonb_build_object('reference', v_ref, 'token', v_token, 'total', v_total);
end;
$$;

revoke all on function public.web_place_pass_checkout(jsonb) from public;
grant execute on function public.web_place_pass_checkout(jsonb) to anon, authenticated;

-- 7) Receipt: add event + passes -------------------------------------------------------
create or replace function public.web_get_checkout(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
        'checked_in', t.checked_in_at is not null) order by t.external_id), '[]'::jsonb)
      from public.tickets t
      where t.web_checkout_id = c.id and t.pass_token is not null and t.deleted_at is null
    )
  )
  from public.web_checkouts c
  where c.public_token = p_token
$$;

revoke all on function public.web_get_checkout(uuid) from public;
grant execute on function public.web_get_checkout(uuid) to anon, authenticated;

-- 8) Review: handle pass checkouts too ---------------------------------------------------
create or replace function public.web_review_checkout(
  p_checkout_id uuid, p_decision text, p_account_code text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_c record; v_o record;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_decision not in ('verified','rejected') then
    raise exception 'decision must be verified or rejected' using errcode = '22023';
  end if;
  select * into v_c from public.web_checkouts where id = p_checkout_id for update;
  if not found then raise exception 'checkout not found' using errcode = '23503'; end if;
  if v_c.payment_verification <> 'unverified' then
    raise exception 'already %', v_c.payment_verification using errcode = '22023';
  end if;
  if p_decision = 'verified' and (p_account_code is null or p_account_code = 'Unverified Receipts'
     or not exists (select 1 from public.accounts where code = p_account_code and is_active)) then
    raise exception 'choose the account the money actually landed in' using errcode = '22023';
  end if;

  if v_c.kind = 'passes' then
    if v_c.total > 0 then
      if p_decision = 'verified' then
        perform public.ledger_apply('Unverified Receipts', 'out', v_c.total, 'web_checkout', v_c.id, v_c.reference,
          'Website ' || v_c.reference || ' verified → ' || p_account_code, 'web-verify-out-' || v_c.id::text);
        perform public.ledger_apply(p_account_code, 'in', v_c.total, 'web_checkout', v_c.id, v_c.reference,
          'Website ' || v_c.reference || ' verified', 'web-verify-in-' || v_c.id::text);
      else
        perform public.ledger_apply('Unverified Receipts', 'out', v_c.total, 'web_checkout', v_c.id, v_c.reference,
          'Website ' || v_c.reference || ' rejected', 'web-reject-' || v_c.id::text);
      end if;
    end if;
    if p_decision = 'verified' then
      update public.tickets set notes = replace(coalesce(notes, ''), ' (unverified)', '')
       where web_checkout_id = v_c.id;
    else
      update public.tickets
         set payment_status = 'Refunded', deleted_at = now(),
             notes = coalesce(notes || E'\n', '') || 'Payment rejected' || coalesce(': ' || p_note, '')
       where web_checkout_id = v_c.id and deleted_at is null;
    end if;
  elsif p_decision = 'verified' then
    for v_o in select * from public.orders where web_checkout_id = v_c.id and deleted_at is null loop
      if v_o.total > 0 then
        perform public.ledger_apply('Unverified Receipts', 'out', v_o.total, 'order', v_o.id, v_o.external_id,
          'Website ' || v_c.reference || ' verified → ' || p_account_code, 'web-verify-out-' || v_o.id::text);
        perform public.ledger_apply(p_account_code, 'in', v_o.total, 'order', v_o.id, v_o.external_id,
          'Website ' || v_c.reference || ' verified', 'web-verify-in-' || v_o.id::text);
      end if;
      update public.orders set payment_verification = 'verified' where id = v_o.id;
    end loop;
  else
    if exists (select 1 from public.orders where web_checkout_id = v_c.id and deleted_at is null and fulfillment_status = 'Delivered') then
      raise exception 'a delivery for this order already went out — handle it from Orders instead' using errcode = '22023';
    end if;
    for v_o in select * from public.orders where web_checkout_id = v_c.id and deleted_at is null loop
      if v_o.total > 0 then
        perform public.ledger_apply('Unverified Receipts', 'out', v_o.total, 'order', v_o.id, v_o.external_id,
          'Website ' || v_c.reference || ' rejected', 'web-reject-' || v_o.id::text);
      end if;
      update public.orders
         set payment_verification = 'rejected', payment_status = 'Cancelled',
             fulfillment_status = 'Cancelled',
             notes = coalesce(notes || E'\n', '') || 'Payment rejected' || coalesce(': ' || p_note, '')
       where id = v_o.id;
    end loop;
  end if;

  update public.web_checkouts
     set payment_verification = p_decision,
         verified_account_code = case when p_decision = 'verified' then p_account_code end,
         review_note = p_note, reviewed_at = now(), reviewed_by_user_id = auth.uid(), updated_at = now()
   where id = v_c.id;
  return jsonb_build_object('id', v_c.id, 'decision', p_decision);
end;
$$;

revoke all on function public.web_review_checkout(uuid, text, text, text) from public;
grant execute on function public.web_review_checkout(uuid, text, text, text) to authenticated;

-- 9) Staff check-in by QR token ------------------------------------------------------------
create or replace function public.check_in_pass(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_t record; v_name text;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  select * into v_t from public.tickets where pass_token = p_token for update;
  if not found then raise exception 'Pass not found.' using errcode = '23503'; end if;
  if v_t.deleted_at is not null or v_t.payment_status = 'Refunded' then
    raise exception 'This pass was cancelled.' using errcode = '22023';
  end if;
  if v_t.checked_in_at is not null then
    return jsonb_build_object('status', 'already', 'checked_in_at', v_t.checked_in_at,
      'holder', v_t.holder_name, 'sport', v_t.ticket_type_name, 'event', v_t.event_name, 'code', v_t.external_id);
  end if;
  select display_name into v_name from public.team_members where user_id = auth.uid();
  update public.tickets
     set checked_in_at = now(), checked_in_by_user_id = auth.uid(), checked_in_by_name = v_name
   where id = v_t.id;
  return jsonb_build_object('status', 'ok', 'holder', v_t.holder_name, 'sport', v_t.ticket_type_name,
    'event', v_t.event_name, 'event_date', v_t.event_date, 'code', v_t.external_id);
end;
$$;

revoke all on function public.check_in_pass(uuid) from public;
grant execute on function public.check_in_pass(uuid) to authenticated;
