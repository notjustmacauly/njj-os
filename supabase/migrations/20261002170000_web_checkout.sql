-- =================================================================
-- Website — Phase B checkout (bank QR + screenshot soft-confirm).
--
--  web_checkouts       one row per customer checkout (contact, cart, proof,
--                      verification status). Never readable by anon.
--  orders.web_checkout_id
--                      each checkout becomes one Online order PER DELIVERY
--                      DATE (a 28-Pack = 4 weekly orders). Packs that share a
--                      date share one order + one delivery fee.
--  web_place_checkout  anon-callable, SECURITY DEFINER. Re-prices everything
--                      from web_products (never trusts the client), checks
--                      stock, creates orders + items, posts each order's
--                      total to the 'Unverified Receipts' holding account and
--                      marks it Paid / unverified. Requires an uploaded proof.
--  web_get_checkout    anon, token-only receipt for the confirmation page.
--  web_review_checkout staff verify (move holding → real account) or reject
--                      (reverse holding, cancel orders, release stock).
--  web_stock_by_sku    now subtracts cans held by undelivered web orders due
--                      within the next 7 days.
--  bucket web-payment-proofs  private; anyone may upload, staff may read.
-- =================================================================

-- 1) Checkouts ------------------------------------------------------
create table if not exists public.web_checkouts (
  id                    uuid primary key default gen_random_uuid(),
  reference             text unique not null,
  public_token          uuid unique not null default gen_random_uuid(),
  idempotency_key       text unique,
  customer_name         text not null,
  customer_email        text not null,
  customer_phone        text not null,
  delivery_address      text not null,
  delivery_notes        text,
  first_delivery_date   date not null,
  items                 jsonb not null,
  subtotal              numeric(12,2) not null,
  delivery_total        numeric(12,2) not null,
  total                 numeric(12,2) not null,
  payment_method        text not null default 'bank_qr' check (payment_method in ('bank_qr','xendit_card','xendit_ewallet')),
  payment_verification  text not null default 'unverified' check (payment_verification in ('auto','unverified','verified','rejected')),
  proof_path            text,
  proof_sha256          text,
  flags                 jsonb not null default '[]'::jsonb,
  verified_account_code text references public.accounts(code),
  review_note           text,
  reviewed_at           timestamptz,
  reviewed_by_user_id   uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists web_checkouts_status_idx on public.web_checkouts (payment_verification, created_at desc);
create index if not exists web_checkouts_sha_idx on public.web_checkouts (proof_sha256);
create index if not exists web_checkouts_email_idx on public.web_checkouts (lower(customer_email));

comment on table public.web_checkouts is
  'Public-site checkouts. Each produces one Online order per delivery date (orders.web_checkout_id). Bank-QR payments sit in Unverified Receipts until reviewed.';

alter table public.web_checkouts enable row level security;
drop policy if exists web_checkouts_staff_read on public.web_checkouts;
create policy web_checkouts_staff_read on public.web_checkouts for select to authenticated
  using (public.current_user_role() in ('owner','partner','manager'));

create sequence if not exists public.web_checkout_ref_seq;

alter table public.orders
  add column if not exists web_checkout_id uuid references public.web_checkouts(id);
create index if not exists orders_web_checkout_idx on public.orders (web_checkout_id) where web_checkout_id is not null;

-- 2) Proof uploads ----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('web-payment-proofs', 'web-payment-proofs', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists web_proofs_upload on storage.objects;
create policy web_proofs_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'web-payment-proofs');

drop policy if exists web_proofs_staff_read on storage.objects;
create policy web_proofs_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'web-payment-proofs' and public.current_user_role() in ('owner','partner','manager'));

-- 3) Stock: hold cans for undelivered web orders due within 7 days -----
create or replace function public.web_stock_by_sku()
returns table (sku_code text, cans_remaining numeric)
language sql
stable
security definer
set search_path = public
as $$
  with onhand as (
    select i.sku_code::text as sku_code, sum(i.remaining)::numeric as cans
    from public.inventory_summary i
    group by i.sku_code
  ), held as (
    select oi.sku_code::text as sku_code, sum(oi.qty)::numeric as cans
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.web_checkout_id is not null
      and o.deleted_at is null
      and o.fulfillment_status not in ('Delivered','Cancelled')
      and oi.batch_id is null
      and not exists (select 1 from public.order_item_batch_allocations a where a.order_item_id = oi.id)
      and o.delivery_date <= (now() at time zone 'Asia/Manila')::date + 6
    group by oi.sku_code
  )
  select coalesce(h.sku_code, s.sku_code), coalesce(h.cans, 0) - coalesce(s.cans, 0)
  from onhand h
  full join held s on s.sku_code = h.sku_code
$$;

revoke all on function public.web_stock_by_sku() from public;
grant execute on function public.web_stock_by_sku() to anon, authenticated;

-- 4) Place a checkout ----------------------------------------------------
-- p_payload: { idempotency_key, name, email, phone, address, notes,
--              first_delivery_date, proof_path, proof_sha256,
--              items: [{ product_id, mix: { "PCL": 3, ... } }] }
create or replace function public.web_place_checkout(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := (now() at time zone 'Asia/Manila')::date;
  v_key        text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_name       text := nullif(trim(p_payload->>'name'), '');
  v_email      text := lower(nullif(trim(p_payload->>'email'), ''));
  v_phone      text := nullif(trim(p_payload->>'phone'), '');
  v_address    text := nullif(trim(p_payload->>'address'), '');
  v_notes      text := nullif(trim(p_payload->>'notes'), '');
  v_first      date := nullif(p_payload->>'first_delivery_date', '')::date;
  v_proof      text := nullif(p_payload->>'proof_path', '');
  v_sha        text := nullif(p_payload->>'proof_sha256', '');
  v_existing   record;
  v_item       jsonb;
  v_prod       record;
  v_per        int;
  v_mix_total  int;
  v_code       text;
  v_qty        int;
  v_items      jsonb := '[]'::jsonb;
  v_lines      jsonb := '[]'::jsonb;   -- {week, sku, qty, unit, fee}
  v_need       jsonb := '{}'::jsonb;   -- first-week cans per sku
  v_subtotal   numeric(12,2) := 0;
  v_delivery   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_max_weeks  int := 1;
  v_checkout   uuid;
  v_ref        text;
  v_token      uuid;
  v_flags      jsonb := '[]'::jsonb;
  v_week       int;
  v_date       date;
  v_fee        numeric(12,2);
  v_order      uuid;
  v_order_ext  text;
  v_order_tot  numeric(12,2);
  v_line       jsonb;
  v_stock      numeric;
  v_unit       numeric(12,2);
  v_rounding   numeric(12,2);
begin
  -- Replay-safe: the same submission returns the same checkout.
  if v_key is not null then
    select reference, public_token into v_existing from public.web_checkouts where idempotency_key = v_key;
    if found then
      return jsonb_build_object('reference', v_existing.reference, 'token', v_existing.public_token, 'replayed', true);
    end if;
  end if;

  if v_name is null or v_email is null or v_phone is null or v_address is null then
    raise exception 'Please fill in your name, email, mobile number and delivery address.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  if v_first is null or v_first <= v_today or v_first > v_today + 60 then
    raise exception 'Please choose a delivery date from tomorrow onwards.' using errcode = '22023';
  end if;
  if v_proof is null or not exists (
    select 1 from storage.objects where bucket_id = 'web-payment-proofs' and name = v_proof
  ) then
    raise exception 'Please upload your payment screenshot.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0
     or jsonb_array_length(p_payload->'items') > 20 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  -- Re-price + validate every pack from the catalog.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    select * into v_prod from public.web_products
      where id = nullif(v_item->>'product_id', '')::uuid and is_published and deleted_at is null;
    if not found then
      raise exception 'A pack in your cart is no longer available — please refresh your cart.' using errcode = '22023';
    end if;
    v_per := v_prod.cans_per_unit / v_prod.deliveries;
    v_mix_total := 0;
    for v_code, v_qty in
      select key, value::int from jsonb_each_text(coalesce(v_item->'mix', '{}'::jsonb))
    loop
      if v_qty < 0 then raise exception 'Invalid flavour count.' using errcode = '22023'; end if;
      if v_qty = 0 then continue; end if;
      if not exists (select 1 from public.skus where code = v_code and is_active) then
        raise exception 'Unknown flavour in cart.' using errcode = '22023';
      end if;
      if v_prod.sku_code is not null and v_code <> v_prod.sku_code then
        raise exception '% only comes in one flavour.', v_prod.name using errcode = '22023';
      end if;
      v_mix_total := v_mix_total + v_qty;
      v_need := jsonb_set(v_need, array[v_code], to_jsonb(coalesce((v_need->>v_code)::int, 0) + v_qty));
      -- Unit price per can; any cent rounding lands on the first order's discount.
      v_unit := round(v_prod.price / v_prod.cans_per_unit, 2);
      for v_week in 1..v_prod.deliveries loop
        v_lines := v_lines || jsonb_build_object('week', v_week, 'sku', v_code, 'qty', v_qty,
                                                 'unit', v_unit, 'fee', v_prod.delivery_fee);
      end loop;
    end loop;
    if v_mix_total <> v_per then
      raise exception '% needs exactly % cans per delivery.', v_prod.name, v_per using errcode = '22023';
    end if;
    v_max_weeks := greatest(v_max_weeks, v_prod.deliveries);
    v_subtotal := v_subtotal + v_prod.price;
    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id, 'slug', v_prod.slug, 'name', v_prod.name,
      'cans', v_prod.cans_per_unit, 'deliveries', v_prod.deliveries,
      'price', v_prod.price, 'delivery_fee', v_prod.delivery_fee,
      'mix', v_item->'mix');
  end loop;

  -- Stock for the first delivery.
  for v_code, v_qty in select key, value::int from jsonb_each_text(v_need) loop
    select coalesce(sum(cans_remaining), 0) into v_stock from public.web_stock_by_sku() where sku_code = v_code;
    if v_stock < v_qty then
      raise exception 'Sorry — we only have % % left right now. Please adjust your mix.',
        greatest(v_stock, 0)::int, (select name from public.skus where code = v_code) using errcode = '22023';
    end if;
  end loop;

  -- One delivery fee per delivery date (the highest fee among packs that day).
  for v_week in 1..v_max_weeks loop
    select max((l->>'fee')::numeric) into v_fee from jsonb_array_elements(v_lines) l where (l->>'week')::int = v_week;
    v_delivery := v_delivery + coalesce(v_fee, 0);
  end loop;
  v_total := v_subtotal + v_delivery;

  -- Fraud signals (advisory — they only decide what needs a human look).
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
    reference, idempotency_key, customer_name, customer_email, customer_phone,
    delivery_address, delivery_notes, first_delivery_date, items,
    subtotal, delivery_total, total, proof_path, proof_sha256, flags
  ) values (
    v_ref, v_key, v_name, v_email, v_phone, v_address, v_notes, v_first, v_items,
    v_subtotal, v_delivery, v_total, v_proof, v_sha, v_flags
  ) returning id, public_token into v_checkout, v_token;

  -- One order per delivery date.
  for v_week in 1..v_max_weeks loop
    v_date := v_first + (v_week - 1) * 7;
    select max((l->>'fee')::numeric) into v_fee from jsonb_array_elements(v_lines) l where (l->>'week')::int = v_week;
    insert into public.orders (
      idempotency_key, channel, customer_name, order_date, delivery_date, delivery_fee,
      notes, customer_email, customer_phone, delivery_address,
      payment_method, payment_verification, web_checkout_id
    ) values (
      v_ref || '-W' || v_week, 'Online', v_name, v_today, v_date, coalesce(v_fee, 0),
      'Website ' || v_ref
        || case when v_max_weeks > 1 then ' · delivery ' || v_week || ' of ' || v_max_weeks else '' end
        || coalesce(E'\n' || 'Delivery notes: ' || v_notes, ''),
      v_email, v_phone, v_address,
      'bank_qr', 'unverified', v_checkout
    ) returning id into v_order;

    for v_line in
      select jsonb_build_object('sku', l->>'sku', 'unit', (l->>'unit')::numeric, 'qty', sum((l->>'qty')::int))
      from jsonb_array_elements(v_lines) l
      where (l->>'week')::int = v_week
      group by l->>'sku', (l->>'unit')::numeric
    loop
      insert into public.order_items (order_id, sku_code, qty, unit_price)
      values (v_order, v_line->>'sku', (v_line->>'qty')::int, (v_line->>'unit')::numeric);
    end loop;
  end loop;

  -- Absorb any per-can rounding so the orders add up to the checkout total.
  select v_total - coalesce(sum(total), 0) into v_rounding from public.orders where web_checkout_id = v_checkout;
  if v_rounding <> 0 then
    update public.orders set discount = discount - v_rounding
      where id = (select id from public.orders where web_checkout_id = v_checkout order by delivery_date limit 1);
  end if;

  -- Soft-confirm: every order is Paid into the holding account.
  for v_order, v_order_ext, v_order_tot in
    select id, external_id, total from public.orders where web_checkout_id = v_checkout order by delivery_date
  loop
    if v_order_tot > 0 then
      perform public.ledger_apply(
        p_account_code := 'Unverified Receipts', p_direction := 'in', p_amount := v_order_tot,
        p_ref_type := 'order', p_ref_id := v_order, p_ref_external_id := v_order_ext,
        p_description := 'Website ' || v_ref || ' · bank QR (unverified)',
        p_idempotency_key := 'order-paid-' || v_order::text
      );
    end if;
    update public.orders set payment_status = 'Paid' where id = v_order;
  end loop;

  return jsonb_build_object('reference', v_ref, 'token', v_token, 'total', v_total);
end;
$$;

revoke all on function public.web_place_checkout(jsonb) from public;
grant execute on function public.web_place_checkout(jsonb) to anon, authenticated;

-- 5) Public receipt (token only) -------------------------------------------
create or replace function public.web_get_checkout(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
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
    )
  )
  from public.web_checkouts c
  where c.public_token = p_token
$$;

revoke all on function public.web_get_checkout(uuid) from public;
grant execute on function public.web_get_checkout(uuid) to anon, authenticated;

-- 6) Staff review ------------------------------------------------------------
create or replace function public.web_review_checkout(
  p_checkout_id uuid, p_decision text, p_account_code text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_c record; v_o record;
begin
  if current_user_role() not in ('owner','partner','manager') then
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

  if p_decision = 'verified' then
    if p_account_code is null or p_account_code = 'Unverified Receipts'
       or not exists (select 1 from public.accounts where code = p_account_code and is_active) then
      raise exception 'choose the account the money actually landed in' using errcode = '22023';
    end if;
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
             fulfillment_status = 'Cancelled', deleted_at = now(),
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
