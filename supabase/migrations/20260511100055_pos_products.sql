-- ============================================================
-- pos_products — catalog of non-SKU items sold at the POS
-- Replaces the hardcoded pricing.ts file. Cups, water, paddle
-- rentals, future merch, etc. all live here.
-- Admin-editable via Settings UI.
-- ============================================================
create table if not exists public.pos_products (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                                  -- 'CUP_SM', 'CUP_LG', 'WATER', 'PADDLE_RENT'
  name        text not null,                                          -- display name shown on POS button
  emoji       text,                                                   -- single emoji for the button face
  price       numeric(12,2) not null check (price >= 0),
  category    text not null default 'other'                           -- 'cup', 'water', 'merch', 'rental', 'other'
              check (category in ('cup','water','merch','rental','other')),
  sort_order  integer not null default 0,                             -- lower = shown first on the POS button grid
  is_active   boolean not null default true,
  notes       text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.pos_products is
  'Catalog of non-SKU items sold at the POS (cups, water, rentals, merch). Admin manages via Settings.';

create index if not exists idx_pos_products_active on public.pos_products (sort_order)
  where is_active and deleted_at is null;
create index if not exists idx_pos_products_category on public.pos_products (category)
  where is_active and deleted_at is null;

drop trigger if exists pos_products_set_updated_at on public.pos_products;
create trigger pos_products_set_updated_at
  before update on public.pos_products
  for each row execute function public.set_updated_at();

drop trigger if exists pos_products_audit on public.pos_products;
create trigger pos_products_audit
  after insert or update or delete on public.pos_products
  for each row execute function public.audit_trigger();

alter table public.pos_products enable row level security;

drop policy if exists "all read pos_products" on public.pos_products;
create policy "all read pos_products" on public.pos_products for select to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "admin+manager manage pos_products" on public.pos_products;
create policy "admin+manager manage pos_products" on public.pos_products for all to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- Seed with the current hardcoded entries from pricing.ts so nothing breaks
insert into public.pos_products (code, name, emoji, price, category, sort_order) values
  ('CUP_SM', 'Cup Small', '🥤', 60, 'cup',   10),
  ('CUP_LG', 'Cup Large', '🧋', 80, 'cup',   20),
  ('WATER',  'Water',     '💧', 30, 'water', 30)
on conflict (code) do nothing;
