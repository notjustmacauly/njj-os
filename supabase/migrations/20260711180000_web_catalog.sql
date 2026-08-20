-- =================================================================
-- Website — store catalog (Phase B groundwork, read side).
-- A small owner-editable product catalog for the public storefront, plus an
-- anon-safe view that exposes ONLY published products with live pack
-- availability derived from finished-can inventory. No internal tables are
-- readable by anon — only this view.
-- =================================================================

create table if not exists public.web_products (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  subtitle      text,                         -- e.g. "4-Pack", "7-Day Set"
  description   text,
  sku_code      text references public.skus(code),
  cans_per_unit integer not null check (cans_per_unit > 0),
  price         numeric(12,2) not null check (price >= 0),
  image_url     text,
  badge         text,                          -- optional marketing tag
  is_published  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.web_products is
  'Public storefront catalog. Each row is a sellable pack mapped to a SKU + cans_per_unit for stock/availability. Read publicly via web_catalog view.';

alter table public.web_products enable row level security;
-- Managed by owner/partner/manager (future store admin); no anon table access.
drop policy if exists web_products_manage on public.web_products;
create policy web_products_manage on public.web_products for all to authenticated
  using (public.current_user_role() in ('owner','partner','manager'))
  with check (public.current_user_role() in ('owner','partner','manager'));

-- Anon-safe catalog: published products + live pack availability.
-- Availability = floor(cans remaining for the SKU / cans per pack).
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
    greatest(floor(coalesce(st.cans_remaining, 0) / p.cans_per_unit), 0)::int as packs_available
  from public.web_products p
  left join public.skus s on s.code = p.sku_code
  left join (
    select sku_code, sum(remaining) as cans_remaining
    from public.inventory_summary
    group by sku_code
  ) st on st.sku_code = p.sku_code
  where p.is_published = true and p.deleted_at is null;

revoke all on public.web_catalog from public;
grant select on public.web_catalog to anon, authenticated;

-- Seed the 6 single-flavor packs (4-Pack + 7-Day Set per flavor).
-- Prices default to ₱180/can × cans; owner adjusts + adds images later.
insert into public.web_products (slug, name, subtitle, description, sku_code, cans_per_unit, price, sort_order)
values
  ('glow-pack-4', 'The Glow Pack', '4-Pack',
   'Four cold-pressed Pineapple Cucumber Lemon juices — bright, hydrating, and made to make you glow.',
   'PCL', 4, 720, 10),
  ('glow-and-go-7day', 'Glow & Go: 7-Day Set', '7-Day Set',
   'A full week of Pineapple Cucumber Lemon — one a day to stay refreshed and radiant.',
   'PCL', 7, 1260, 11),
  ('radiance-pack-4', 'The Radiance Pack', '4-Pack',
   'Four Apple Carrot Grape juices — earthy-sweet and packed with everyday goodness.',
   'ACG', 4, 720, 20),
  ('radiate-everyday-7day', 'Radiate Everyday: 7-Day Set', '7-Day Set',
   'Seven days of Apple Carrot Grape — your daily dose of radiance.',
   'ACG', 7, 1260, 21),
  ('refresh-pack-4', 'The Refresh Pack', '4-Pack',
   'Four Watermelon Passionfruit Mint juices — crisp, cooling, and endlessly refreshing.',
   'WPM', 4, 720, 30),
  ('hydrate-radiate-7day', 'Hydrate & Radiate: 7-Day Set', '7-Day Set',
   'A week of Watermelon Passionfruit Mint — hydration that tastes like summer.',
   'WPM', 7, 1260, 31)
on conflict (slug) do nothing;
