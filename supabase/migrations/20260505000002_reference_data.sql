-- ============================================================
-- NJJ OS v2 — Migration 2: Reference Data
-- ============================================================
-- Catalog tables that operational tables depend on:
--   accounts        — money accounts (Cash, GCash, bank, Xendit, ...)
--   skus            — juice SKU catalog (PCL, ACG, WPM)
--   ticket_types    — event ticket type catalog (per-event, per-tier)
--   wix_product_map — Wix product ID → internal SKU mapping (replaces
--                     keyword guessing in the legacy Wix sync)
--
-- All four are admin-managed, everyone-else read. Audit-logged on changes.
-- All have UUID primary keys (for FKs + audit_trigger) plus a human-readable
-- `code` unique column for easy referencing in queries.
-- ============================================================

-- ── accounts ────────────────────────────────────────────────
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,        -- 'Cash', 'GCash General', ...
  name            text not null,
  opening_balance numeric(12,2) not null default 0,
  currency        text not null default 'PHP' check (currency = 'PHP'),
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.accounts is
  'Money accounts for the ledger. Opening balance is editable; current balance is computed from ledger_entries.';

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists accounts_audit on public.accounts;
create trigger accounts_audit
  after insert or update or delete on public.accounts
  for each row execute function public.audit_trigger();

alter table public.accounts enable row level security;

drop policy if exists "all read accounts" on public.accounts;
create policy "all read accounts"
  on public.accounts for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "admin manages accounts" on public.accounts;
create policy "admin manages accounts"
  on public.accounts for all
  to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

insert into public.accounts (code, name, notes) values
  ('Cash',              'Cash on hand',           'Physical cash, including event float'),
  ('GCash General',     'GCash General',          'Primary GCash for sales receipts'),
  ('GCash Expense',     'GCash Expense',          'GCash for expenses paid out'),
  ('Origin Account',    'Origin Bank Account',    'Main operating bank account'),
  ('Corporate Account', 'Corporate Bank Account', 'Corporate / partner-facing bank account'),
  ('Xendit',            'Xendit Online Payments', 'Online payment gateway for ticket + Wix sales')
on conflict (code) do nothing;

-- ── skus ────────────────────────────────────────────────────
create table if not exists public.skus (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                      -- 'PCL', 'ACG', 'WPM'
  name          text not null,                             -- 'Pineapple Coconut Lime'
  short_label   text not null,                             -- compact display ('PCL')
  size_ml       integer not null default 355,
  retail_price  numeric(12,2) not null,                    -- fallback for non-B2B / no-override orders
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.skus is
  'Juice product catalog. retail_price is the fallback used when no order override and no partner-specific price applies.';

drop trigger if exists skus_set_updated_at on public.skus;
create trigger skus_set_updated_at
  before update on public.skus
  for each row execute function public.set_updated_at();

drop trigger if exists skus_audit on public.skus;
create trigger skus_audit
  after insert or update or delete on public.skus
  for each row execute function public.audit_trigger();

alter table public.skus enable row level security;

drop policy if exists "all read skus" on public.skus;
create policy "all read skus"
  on public.skus for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "admin manages skus" on public.skus;
create policy "admin manages skus"
  on public.skus for all
  to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

insert into public.skus (code, name, short_label, retail_price) values
  ('PCL', 'Pineapple Coconut Lime',     'PCL', 195),
  ('ACG', 'Apple Carrot Ginger',         'ACG', 195),
  ('WPM', 'Watermelon Passionfruit Mint', 'WPM', 195)
on conflict (code) do nothing;

-- ── ticket_types ────────────────────────────────────────────
create table if not exists public.ticket_types (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,        -- 'TT-BADMINTON', 'RAP-OTD', ...
  event_category  text not null,               -- 'Total Tuesday', 'Rise and Pickle', ...
  name            text not null,               -- 'SMASH - Badminton', 'On-The-Day', ...
  price           numeric(12,2) not null,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.ticket_types is
  'Catalog of ticket types per event category. Manual POS-issued tickets reference these. Wix-synced tickets store their own ticket type as free text.';

create index if not exists idx_ticket_types_event_cat on public.ticket_types (event_category) where is_active;

drop trigger if exists ticket_types_set_updated_at on public.ticket_types;
create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function public.set_updated_at();

drop trigger if exists ticket_types_audit on public.ticket_types;
create trigger ticket_types_audit
  after insert or update or delete on public.ticket_types
  for each row execute function public.audit_trigger();

alter table public.ticket_types enable row level security;

drop policy if exists "all read ticket_types" on public.ticket_types;
create policy "all read ticket_types"
  on public.ticket_types for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "admin+manager manage ticket_types" on public.ticket_types;
create policy "admin+manager manage ticket_types"
  on public.ticket_types for all
  to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- Initial seeds based on currently-known event types. Mac can edit/add via admin UI.
insert into public.ticket_types (code, event_category, name, price) values
  ('TT-BADMINTON',     'Total Tuesday',   'SMASH - Badminton',  240),
  ('TT-VOLLEYBALL',    'Total Tuesday',   'SPIKE - Volleyball', 240),
  ('TT-GENERAL',       'Total Tuesday',   'General Admission',  240),
  ('RAP-OTD',          'Rise and Pickle', 'On-The-Day',         200),
  ('RAP-PADDLE-RENT',  'Rise and Pickle', 'Paddle Rental',       50),
  ('RENT-PADDLE',      'Rentals',         'Paddle Rental',       50)
on conflict (code) do nothing;

-- ── wix_product_map ─────────────────────────────────────────
-- Replaces the keyword-guessing in the legacy Wix sync. Each entry maps a
-- Wix product to one or more internal SKUs, with cans_per_unit telling the
-- syncer how many cans a single Wix purchase represents.
--
-- For solo SKUs (1 product = 1 SKU), `flavor_breakdown` is null and the
-- single sku_code applies.
-- For bundles (1 product = N cans across flavors), `flavor_breakdown` is a
-- JSON object {"PCL": 2, "ACG": 1, "WPM": 1} (cans per flavor for one unit
-- of the Wix product).
--
-- When a Wix order arrives with an unmapped product ID, the syncer sets the
-- order to "needs review" and notifies admin instead of guessing.
create table if not exists public.wix_product_map (
  id                uuid primary key default gen_random_uuid(),
  wix_product_id    text not null unique,
  wix_product_name  text not null,                          -- denormalized for reference
  sku_code          text references public.skus(code),       -- null if pure bundle (use flavor_breakdown)
  cans_per_unit     integer not null default 1 check (cans_per_unit > 0),
  flavor_breakdown  jsonb,                                   -- {"PCL": 1, "ACG": 2, ...}
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (sku_code is not null or flavor_breakdown is not null)
);

comment on table public.wix_product_map is
  'Maps Wix product IDs to our SKUs. Solo products use sku_code; bundles use flavor_breakdown.';

drop trigger if exists wix_product_map_set_updated_at on public.wix_product_map;
create trigger wix_product_map_set_updated_at
  before update on public.wix_product_map
  for each row execute function public.set_updated_at();

drop trigger if exists wix_product_map_audit on public.wix_product_map;
create trigger wix_product_map_audit
  after insert or update or delete on public.wix_product_map
  for each row execute function public.audit_trigger();

alter table public.wix_product_map enable row level security;

drop policy if exists "all read wix_product_map" on public.wix_product_map;
create policy "all read wix_product_map"
  on public.wix_product_map for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "admin manages wix_product_map" on public.wix_product_map;
create policy "admin manages wix_product_map"
  on public.wix_product_map for all
  to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- No seed data — Mac populates via admin UI (or SQL) once we have actual Wix product IDs.

-- ============================================================
-- End of migration 2
-- ============================================================
