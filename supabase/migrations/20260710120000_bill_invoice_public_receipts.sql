-- =================================================================
-- Billing Phase 1 — public per-delivery receipts.
--
-- Each order gets an unguessable public_token. A branded bill (invoice)
-- lists each delivery as a link to /receipt/<token>, a read-only page a
-- partner can open with no login. The page is served by get_delivery_receipt,
-- a SECURITY DEFINER function granted to anon so we never open up the orders
-- table itself — only this one narrow, token-gated view.
-- =================================================================

-- 1) Stable, unguessable share token per order.
alter table public.orders
  add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists orders_public_token_key on public.orders (public_token);

-- 2) Public receipt payload for one token. Returns null if the token doesn't
--    resolve to a live order. Exposes only what belongs on a delivery receipt.
create or replace function public.get_delivery_receipt(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'external_id',   o.external_id,
      'order_date',    o.order_date,
      'delivery_date', o.delivery_date,
      'channel',       o.channel,
      'delivery_fee',  o.delivery_fee,
      'discount',      o.discount,
      'subtotal',      o.subtotal,
      'total',         o.total
    ),
    'partner', jsonb_build_object(
      'name',                     p.name,
      'registered_business_name', p.registered_business_name
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku_code',   oi.sku_code,
        'sku_name',   coalesce(s.name, oi.sku_code),
        'qty',        oi.qty,
        'unit_price', oi.unit_price,
        'subtotal',   oi.subtotal
      ) order by oi.created_at)
      from public.order_items oi
      left join public.skus s on s.code = oi.sku_code
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  left join public.partners p on p.id = o.partner_id
  where o.public_token = p_token and o.deleted_at is null;
$function$;

revoke all on function public.get_delivery_receipt(uuid) from public;
grant execute on function public.get_delivery_receipt(uuid) to anon, authenticated;
