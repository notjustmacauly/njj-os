-- =================================================================
-- Website — bundle-only shop with build-your-own flavour mix.
-- The shop now sells exactly three packs (4-Pack, 7-Pack, 28-Pack). Flavour
-- is no longer part of the product: the customer picks a mix (all one
-- flavour, or any split) at order time. The 28-Pack is 7 cans/week delivered
-- over 4 weeks with the same locked-in mix each week.
--
--  * web_products.sku_code is left NULL for mix packs.
--  * deliveries      — how many drops the pack is split into (28-Pack = 4).
--  * delivery_fee    — charged per delivery (₱50).
--  * web_flavors     — anon-safe per-flavour stock for the pack builder.
-- =================================================================

alter table public.web_products
  add column if not exists deliveries   integer not null default 1 check (deliveries > 0),
  add column if not exists delivery_fee numeric(12,2) not null default 50 check (delivery_fee >= 0);

alter table public.web_products
  drop constraint if exists web_products_cans_split_check;
alter table public.web_products
  add constraint web_products_cans_split_check check (cans_per_unit % deliveries = 0);

comment on column public.web_products.deliveries is
  'Number of deliveries the pack is split into; cans per delivery = cans_per_unit / deliveries. Mix is locked across deliveries.';
comment on column public.web_products.delivery_fee is
  'Delivery fee charged per delivery (total = delivery_fee × deliveries).';

-- Retire the six single-flavour packs (soft delete keeps history).
update public.web_products
   set deleted_at = now(), is_published = false, updated_at = now()
 where slug in ('glow-pack-4','glow-and-go-7day','radiance-pack-4',
                'radiate-everyday-7day','refresh-pack-4','hydrate-radiate-7day')
   and deleted_at is null;

insert into public.web_products
  (slug, name, subtitle, description, sku_code, cans_per_unit, deliveries, delivery_fee, price, sort_order, is_published)
values
  ('4-pack', 'The 4-Pack', '4 cans',
   'Four cold-pressed collagen juices. Go all in on one flavour or mix your own.',
   null, 4, 1, 50, 720, 10, true),
  ('7-pack', 'The 7-Pack', '7 cans · one a day',
   'A full week of glow — seven cans, any mix you like.',
   null, 7, 1, 50, 1155, 20, true),
  ('28-pack', 'The 28-Pack', '7 cans a week · 4 weeks',
   'A month of juice, delivered fresh every week. Pick your 7-can mix once and we bring it weekly for four weeks.',
   null, 28, 4, 50, 4200, 30, true)
on conflict (slug) do nothing;

-- Catalog view: same columns as before + deliveries/delivery_fee appended.
-- Mix packs (no sku_code) are available while the total finished-can stock
-- covers one delivery's worth of cans.
create or replace view public.web_catalog
with (security_invoker = false) as
  select
    p.id,
    p.slug,
    p.name,
    p.subtitle,
    p.description,
    p.sku_code,
    s.name as flavor_name,
    p.cans_per_unit,
    p.price,
    p.image_url,
    p.badge,
    p.sort_order,
    greatest(floor(
      case when p.sku_code is null then coalesce(tot.cans_remaining, 0)
           else coalesce(st.cans_remaining, 0) end
      / (p.cans_per_unit / p.deliveries)
    ), 0)::int as packs_available,
    p.deliveries,
    p.delivery_fee
  from public.web_products p
  left join public.skus s on s.code = p.sku_code
  left join (
    select sku_code, sum(remaining) as cans_remaining
    from public.inventory_summary
    group by sku_code
  ) st on st.sku_code = p.sku_code
  cross join (
    select sum(i.remaining) as cans_remaining
    from public.inventory_summary i
    join public.skus k on k.code = i.sku_code and k.is_active
  ) tot
  where p.is_published = true and p.deleted_at is null;

revoke all on public.web_catalog from public;
grant select on public.web_catalog to anon, authenticated;

-- Per-flavour stock for the pack builder (active SKUs only).
create or replace view public.web_flavors
with (security_invoker = false) as
  select
    k.code,
    k.name,
    greatest(coalesce(sum(i.remaining), 0), 0)::int as cans_available
  from public.skus k
  left join public.inventory_summary i on i.sku_code = k.code
  where k.is_active
  group by k.code, k.name;

revoke all on public.web_flavors from public;
grant select on public.web_flavors to anon, authenticated;
