-- =================================================================
-- Website — fix public stock reads.
-- inventory_summary is security_invoker, so when the public web views read it
-- as anon, RLS on the underlying tables returned nothing and every pack showed
-- sold out. Route the public views through a SECURITY DEFINER function that
-- exposes only per-SKU can totals (no lot/batch detail).
-- =================================================================

create or replace function public.web_stock_by_sku()
returns table (sku_code text, cans_remaining numeric)
language sql
stable
security definer
set search_path = public
as $$
  select i.sku_code::text, sum(i.remaining)::numeric
  from public.inventory_summary i
  group by i.sku_code
$$;

revoke all on function public.web_stock_by_sku() from public;
grant execute on function public.web_stock_by_sku() to anon, authenticated;

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
  left join public.web_stock_by_sku() st on st.sku_code = p.sku_code
  cross join (
    select sum(w.cans_remaining) as cans_remaining
    from public.web_stock_by_sku() w
    join public.skus k on k.code = w.sku_code and k.is_active
  ) tot
  where p.is_published = true and p.deleted_at is null;

revoke all on public.web_catalog from public;
grant select on public.web_catalog to anon, authenticated;

create or replace view public.web_flavors
with (security_invoker = false) as
  select
    k.code,
    k.name,
    greatest(coalesce(w.cans_remaining, 0), 0)::int as cans_available
  from public.skus k
  left join public.web_stock_by_sku() w on w.sku_code = k.code
  where k.is_active;

revoke all on public.web_flavors from public;
grant select on public.web_flavors to anon, authenticated;
