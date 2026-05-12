-- ============================================================
-- NJJ OS v2 — Migration 5: Orders
-- ============================================================
--   orders        — sales order header (B2B / Retail / Online / Event)
--   order_items   — normalized line items (one row per SKU)
--   create_order() RPC — atomic order creation with idempotency
--
-- Key design choices:
-- - orders.subtotal/total/pcl_qty/acg_qty/wpm_qty are MAINTAINED columns,
--   recomputed by trigger whenever order_items or order pricing fields change.
--   Hanneh and Chrissia get the at-a-glance flavor view; reports get a clean
--   normalized order_items table.
-- - order_items.unit_price is SNAPSHOTTED at creation. Future partner price
--   changes don't shift historical order amounts.
-- - Idempotency: orders.idempotency_key is unique. Frontend generates a UUID
--   per submit; double-taps return the same order, no duplicates possible.
-- - Status enums enforced at the type level (no free-text "Recievable" typos).
-- ============================================================

-- ── enums ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_channel') then
    create type public.order_channel as enum ('B2B','Retail','Online','Event');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('Pending','Paid','Receivable','Billed','Partial','Cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'fulfillment_status') then
    create type public.fulfillment_status as enum ('Pending','Packed','Delivered','Cancelled');
  end if;
end$$;

-- ── orders ──────────────────────────────────────────────────
create sequence if not exists public.orders_external_id_seq start 1;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text unique,                                       -- 'ORD-260505-001'
  idempotency_key     text unique,                                       -- per-submit UUID, prevents double-creates
  order_date          date not null default current_date,
  channel             public.order_channel not null,
  partner_id          uuid references public.partners(id) on delete restrict,
  customer_name       text,                                              -- retail / walk-in display
  event_name          text,                                              -- only when channel = 'Event'
  delivery_date       date,
  delivery_fee        numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount            numeric(12,2) not null default 0 check (discount >= 0),
  override_total      numeric(12,2) check (override_total is null or override_total >= 0),
  -- Maintained columns: do not write directly. Updated by trigger from order_items.
  subtotal            numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  pcl_qty             integer not null default 0,
  acg_qty             integer not null default 0,
  wpm_qty             integer not null default 0,
  payment_status      public.payment_status      not null default 'Pending',
  fulfillment_status  public.fulfillment_status  not null default 'Pending',
  notes               text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Channel-specific guarantees:
  constraint orders_b2b_has_partner    check (channel <> 'B2B'   or partner_id is not null),
  constraint orders_event_has_event    check (channel <> 'Event' or event_name is not null)
);

comment on table public.orders is
  'Sales order header. subtotal/total/pcl_qty/acg_qty/wpm_qty are maintained by trigger from order_items; do not write directly.';
comment on column public.orders.idempotency_key is
  'Per-submit UUID. Unique constraint prevents double-create from form double-taps.';

create index if not exists idx_orders_date          on public.orders (order_date desc) where deleted_at is null;
create index if not exists idx_orders_partner_date  on public.orders (partner_id, order_date desc) where deleted_at is null;
create index if not exists idx_orders_payment       on public.orders (payment_status) where deleted_at is null;
create index if not exists idx_orders_fulfillment   on public.orders (fulfillment_status) where deleted_at is null;
create index if not exists idx_orders_channel_date  on public.orders (channel, order_date desc) where deleted_at is null;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function public.audit_trigger();

-- Auto-assign external_id (ORD-yymmdd-NNN)
create or replace function public.assign_order_external_id()
returns trigger
language plpgsql
as $$
declare
  v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.order_date, current_date), 'YYMMDD');
    new.external_id := 'ORD-' || v_date_part || '-' ||
      lpad(nextval('public.orders_external_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_assign_external_id on public.orders;
create trigger orders_assign_external_id
  before insert on public.orders
  for each row execute function public.assign_order_external_id();

alter table public.orders enable row level security;

drop policy if exists "ops+ read orders" on public.orders;
create policy "ops+ read orders"
  on public.orders for select
  to authenticated
  using (
    current_user_role() in ('admin','manager','ops')
    and deleted_at is null
  );

drop policy if exists "ops+ manage orders" on public.orders;
create policy "ops+ manage orders"
  on public.orders for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops'))
  with check (current_user_role() in ('admin','manager','ops'));

-- ── order_items ─────────────────────────────────────────────
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  sku_code      text not null references public.skus(code),
  qty           integer not null check (qty > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),                  -- snapshotted at write
  subtotal      numeric(12,2) generated always as (qty * unit_price) stored,
  batch_id      uuid references public.batches(id) on delete set null,           -- which batch fulfilled this line
  notes         text,
  created_at    timestamptz not null default now(),
  unique (order_id, sku_code)                                                    -- one row per SKU per order
);

comment on table public.order_items is
  'Normalized line items. unit_price snapshotted at write time so historical totals do not shift when partner prices change.';

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_sku   on public.order_items (sku_code);
create index if not exists idx_order_items_batch on public.order_items (batch_id) where batch_id is not null;

drop trigger if exists order_items_audit on public.order_items;
create trigger order_items_audit
  after insert or update or delete on public.order_items
  for each row execute function public.audit_trigger();

alter table public.order_items enable row level security;

drop policy if exists "ops+ read order_items" on public.order_items;
create policy "ops+ read order_items"
  on public.order_items for select
  to authenticated
  using (current_user_role() in ('admin','manager','ops'));

drop policy if exists "ops+ manage order_items" on public.order_items;
create policy "ops+ manage order_items"
  on public.order_items for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops'))
  with check (current_user_role() in ('admin','manager','ops'));

-- ── recompute_order_totals(order_id) ────────────────────────
-- Recomputes the maintained columns on orders from current order_items state
-- and current order-level pricing fields (delivery_fee, discount, override_total).
-- Idempotent and cheap.
create or replace function public.recompute_order_totals(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal      numeric(12,2);
  v_pcl_qty       integer;
  v_acg_qty       integer;
  v_wpm_qty       integer;
  v_delivery_fee  numeric(12,2);
  v_discount      numeric(12,2);
  v_override      numeric(12,2);
  v_total         numeric(12,2);
begin
  select
    coalesce(sum(subtotal), 0),
    coalesce(sum(qty) filter (where sku_code = 'PCL'), 0),
    coalesce(sum(qty) filter (where sku_code = 'ACG'), 0),
    coalesce(sum(qty) filter (where sku_code = 'WPM'), 0)
  into v_subtotal, v_pcl_qty, v_acg_qty, v_wpm_qty
  from public.order_items
  where order_id = p_order_id;

  select delivery_fee, discount, override_total
  into v_delivery_fee, v_discount, v_override
  from public.orders
  where id = p_order_id;

  if v_override is not null then
    v_total := v_override;
  else
    v_total := v_subtotal + coalesce(v_delivery_fee, 0) - coalesce(v_discount, 0);
  end if;

  update public.orders
    set subtotal = v_subtotal,
        total    = v_total,
        pcl_qty  = v_pcl_qty,
        acg_qty  = v_acg_qty,
        wpm_qty  = v_wpm_qty
    where id = p_order_id;
end;
$$;

-- Trigger: recompute when items change
create or replace function public.order_items_after_change()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce((new).order_id, (old).order_id);
  perform public.recompute_order_totals(v_order_id);
  return null;
end;
$$;

drop trigger if exists order_items_recompute_order on public.order_items;
create trigger order_items_recompute_order
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_after_change();

-- Trigger: recompute when delivery_fee / discount / override_total change.
-- Skips if only the maintained columns themselves changed (no recursion).
create or replace function public.orders_recompute_on_pricing_change()
returns trigger
language plpgsql
as $$
begin
  if (old.delivery_fee   is distinct from new.delivery_fee) or
     (old.discount       is distinct from new.discount) or
     (old.override_total is distinct from new.override_total) then
    perform public.recompute_order_totals(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_recompute_on_pricing_change on public.orders;
create trigger orders_recompute_on_pricing_change
  after update on public.orders
  for each row execute function public.orders_recompute_on_pricing_change();

-- ── create_order() RPC ──────────────────────────────────────
-- Atomic order creation with idempotency. Frontend calls:
--   const { data: orderId } = await supabase.rpc('create_order', {
--     p_idempotency_key: crypto.randomUUID(),
--     p_channel: 'B2B',
--     p_partner_id: '...',
--     ...
--     p_items: [{ sku_code: 'PCL', qty: 2 }, { sku_code: 'ACG', qty: 1 }]
--   });
--
-- Items can include unit_price to override the partner-tier-derived price.
-- If omitted, partner_price_for_sku() resolves the price.
create or replace function public.create_order(
  p_idempotency_key text,
  p_channel         text,
  p_partner_id      uuid    default null,
  p_customer_name   text    default null,
  p_event_name      text    default null,
  p_order_date      date    default current_date,
  p_delivery_date   date    default null,
  p_delivery_fee    numeric default null,
  p_discount        numeric default 0,
  p_override_total  numeric default null,
  p_notes           text    default null,
  p_items           jsonb   default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id          uuid;
  v_existing_id       uuid;
  v_partner_delivery  numeric;
  v_item              jsonb;
  v_sku_code          text;
  v_qty               integer;
  v_unit_price        numeric;
  v_batch_id          uuid;
begin
  -- Authorization check
  if current_user_role() not in ('admin','manager','ops') then
    raise exception 'insufficient privileges to create orders' using errcode = '42501';
  end if;

  -- Idempotency: if this key was already used, return existing order
  if p_idempotency_key is not null then
    select id into v_existing_id from public.orders where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  -- Default delivery_fee from partner when channel = B2B and no override
  if p_delivery_fee is null and p_partner_id is not null then
    select delivery_fee into v_partner_delivery from public.partners where id = p_partner_id;
    p_delivery_fee := coalesce(v_partner_delivery, 0);
  end if;
  p_delivery_fee := coalesce(p_delivery_fee, 0);

  -- Insert order header
  insert into public.orders (
    idempotency_key, channel, partner_id, customer_name, event_name,
    order_date, delivery_date, delivery_fee, discount, override_total, notes,
    created_by_user_id
  ) values (
    p_idempotency_key, p_channel::public.order_channel, p_partner_id, p_customer_name, p_event_name,
    p_order_date, p_delivery_date, p_delivery_fee, p_discount, p_override_total, p_notes,
    auth.uid()
  ) returning id into v_order_id;

  -- Insert order items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku_code := v_item->>'sku_code';
    v_qty      := (v_item->>'qty')::int;
    v_batch_id := nullif(v_item->>'batch_id', '')::uuid;

    if v_sku_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid order item: %', v_item using errcode = '22023';
    end if;

    -- Use caller-provided unit_price if given, else resolve from partner/tier/retail
    if v_item ? 'unit_price' and (v_item->>'unit_price') is not null then
      v_unit_price := (v_item->>'unit_price')::numeric;
    elsif p_partner_id is not null then
      v_unit_price := public.partner_price_for_sku(p_partner_id, v_sku_code);
    else
      select retail_price into v_unit_price from public.skus where code = v_sku_code;
    end if;

    insert into public.order_items (order_id, sku_code, qty, unit_price, batch_id)
      values (v_order_id, v_sku_code, v_qty, v_unit_price, v_batch_id);
  end loop;

  -- Triggers have now refreshed orders aggregates.
  return v_order_id;
end;
$$;

comment on function public.create_order is
  'Atomic order creation. Returns existing order_id if idempotency_key already used. Items: jsonb array of {sku_code, qty, batch_id?, unit_price?}.';

revoke all on function public.create_order(text, text, uuid, text, text, date, date, numeric, numeric, numeric, text, jsonb) from public;
grant  execute on function public.create_order(text, text, uuid, text, text, date, date, numeric, numeric, numeric, text, jsonb) to authenticated;

-- ============================================================
-- End of migration 5
-- ============================================================
