-- ============================================================
-- NJJ OS v2 — Migration 4: Production
-- ============================================================
-- Replaces the wide-row legacy "fruit1/fruit2/fruit3" batch design with
-- a normalized 3-table model:
--   ingredients   — master catalog (per-ingredient cost, type, unit)
--   batches       — production-run header (date, SKU, units, QC fields)
--   batch_inputs  — line items: which ingredients went into a batch and how much
--
-- Design choices:
-- - Ingredient cost is snapshotted onto batch_inputs at write time, so changing
--   an ingredient's price later does not retroactively shift historical COGS.
-- - batches.cogs_total is auto-maintained from batch_inputs by trigger.
-- - External IDs (BATCH-260505-001) auto-assigned via sequence.
-- - Soft delete via deleted_at on all three tables.
-- ============================================================

-- ── ingredient_type enum ────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingredient_type') then
    create type public.ingredient_type as enum (
      'produce',     -- fruits + vegetables (pineapple, apple, carrot, etc.)
      'additive',    -- collagen, carrageenan, etc.
      'water',
      'sweetener',
      'other'
    );
  end if;
end$$;

-- ── ingredients ─────────────────────────────────────────────
create table if not exists public.ingredients (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                    -- 'PINEAPPLE', 'COLLAGEN', etc.
  name            text not null,                            -- display name
  type            public.ingredient_type not null,
  unit            text not null check (unit in ('kg','g','L','mL','unit')),
  cost_per_unit   numeric(12,2) not null default 0 check (cost_per_unit >= 0),
  is_active       boolean not null default true,
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.ingredients is
  'Master catalog of production inputs. cost_per_unit is the current price; historical batch COGS uses the snapshot in batch_inputs.';

create index if not exists idx_ingredients_active on public.ingredients (is_active) where deleted_at is null;
create index if not exists idx_ingredients_type   on public.ingredients (type);

drop trigger if exists ingredients_set_updated_at on public.ingredients;
create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row execute function public.set_updated_at();

drop trigger if exists ingredients_audit on public.ingredients;
create trigger ingredients_audit
  after insert or update or delete on public.ingredients
  for each row execute function public.audit_trigger();

alter table public.ingredients enable row level security;

drop policy if exists "all read ingredients" on public.ingredients;
create policy "all read ingredients"
  on public.ingredients for select
  to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "admin+manager manage ingredients" on public.ingredients;
create policy "admin+manager manage ingredients"
  on public.ingredients for all
  to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- Seed: known ingredients for the 3 current SKUs. cost_per_unit starts at 0;
-- Mac sets real costs via admin UI before logging real batches.
insert into public.ingredients (code, name, type, unit) values
  ('PINEAPPLE',    'Pineapple',     'produce',   'kg'),
  ('COCONUT',      'Coconut',       'produce',   'kg'),
  ('LIME',         'Lime',          'produce',   'kg'),
  ('APPLE',        'Apple',         'produce',   'kg'),
  ('CARROT',       'Carrot',        'produce',   'kg'),
  ('GINGER',       'Ginger',        'produce',   'kg'),
  ('WATERMELON',   'Watermelon',    'produce',   'kg'),
  ('PASSIONFRUIT', 'Passionfruit',  'produce',   'kg'),
  ('MINT',         'Mint',          'produce',   'kg'),
  ('COLLAGEN',     'Collagen',      'additive',  'g'),
  ('CARRAGEENAN',  'Carrageenan',   'additive',  'g'),
  ('WATER',        'Water',         'water',     'L')
on conflict (code) do nothing;

-- ── batches ─────────────────────────────────────────────────
create sequence if not exists public.batches_external_id_seq start 1;

create table if not exists public.batches (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,                                       -- 'BATCH-260505-001'
  batch_date       date not null default current_date,
  sku_code         text not null references public.skus(code),
  units_planned    integer not null default 0 check (units_planned >= 0),
  units_produced   integer not null default 0 check (units_produced >= 0),
  wastage          integer not null default 0 check (wastage >= 0),
  ph               numeric(4,2) check (ph >= 0 and ph <= 14),
  brix             numeric(4,2) check (brix >= 0 and brix <= 100),
  qc_passed        boolean,
  qc_notes         text,
  staff_name       text,                                              -- freeform; for booth-level attribution
  staff_user_id    uuid references auth.users(id) on delete set null, -- the auth user who logged it
  cogs_total       numeric(12,2) not null default 0,                  -- auto-maintained from batch_inputs
  notes            text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.batches is
  'Production run header. cogs_total is auto-maintained from sum of batch_inputs.subtotal via trigger.';
comment on column public.batches.cogs_total is
  'Total COGS for this batch, maintained by trigger on batch_inputs. Do not write directly.';

create index if not exists idx_batches_date     on public.batches (batch_date desc) where deleted_at is null;
create index if not exists idx_batches_sku_date on public.batches (sku_code, batch_date desc) where deleted_at is null;

drop trigger if exists batches_set_updated_at on public.batches;
create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

drop trigger if exists batches_audit on public.batches;
create trigger batches_audit
  after insert or update or delete on public.batches
  for each row execute function public.audit_trigger();

-- Auto-assign external_id on insert
create or replace function public.assign_batch_external_id()
returns trigger
language plpgsql
as $$
declare
  v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.batch_date, current_date), 'YYMMDD');
    new.external_id := 'BATCH-' || v_date_part || '-' ||
      lpad(nextval('public.batches_external_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists batches_assign_external_id on public.batches;
create trigger batches_assign_external_id
  before insert on public.batches
  for each row execute function public.assign_batch_external_id();

alter table public.batches enable row level security;

drop policy if exists "all read batches" on public.batches;
create policy "all read batches"
  on public.batches for select
  to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "ops+ manage batches" on public.batches;
create policy "ops+ manage batches"
  on public.batches for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops'))
  with check (current_user_role() in ('admin','manager','ops'));

-- ── batch_inputs ────────────────────────────────────────────
create table if not exists public.batch_inputs (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.batches(id) on delete cascade,
  ingredient_code   text not null references public.ingredients(code),
  qty_used          numeric(12,3) not null check (qty_used > 0),
  unit              text not null,                                                   -- snapshot of ingredients.unit at write time
  cost_per_unit     numeric(12,2) not null default 0 check (cost_per_unit >= 0),     -- snapshot of ingredients.cost_per_unit at write time
  subtotal          numeric(12,2) generated always as (qty_used * cost_per_unit) stored,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (batch_id, ingredient_code)                                                  -- one row per ingredient per batch
);

comment on table public.batch_inputs is
  'Per-ingredient line items for a batch. unit + cost_per_unit are snapshotted at insert time so historical COGS does not shift when ingredient prices change.';
comment on column public.batch_inputs.subtotal is
  'Generated column: qty_used * cost_per_unit. Always consistent.';

create index if not exists idx_batch_inputs_batch      on public.batch_inputs (batch_id);
create index if not exists idx_batch_inputs_ingredient on public.batch_inputs (ingredient_code);

drop trigger if exists batch_inputs_audit on public.batch_inputs;
create trigger batch_inputs_audit
  after insert or update or delete on public.batch_inputs
  for each row execute function public.audit_trigger();

alter table public.batch_inputs enable row level security;

drop policy if exists "all read batch_inputs" on public.batch_inputs;
create policy "all read batch_inputs"
  on public.batch_inputs for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "ops+ manage batch_inputs" on public.batch_inputs;
create policy "ops+ manage batch_inputs"
  on public.batch_inputs for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops'))
  with check (current_user_role() in ('admin','manager','ops'));

-- ── COGS auto-maintenance ───────────────────────────────────
-- Whenever batch_inputs changes (insert/update/delete), recompute the parent
-- batch's cogs_total. Single source of truth: the inputs.
create or replace function public.recompute_batch_cogs()
returns trigger
language plpgsql
as $$
declare
  v_batch_id uuid;
begin
  v_batch_id := coalesce((new).batch_id, (old).batch_id);
  update public.batches
    set cogs_total = coalesce((
      select sum(subtotal) from public.batch_inputs where batch_id = v_batch_id
    ), 0)
    where id = v_batch_id;
  return null;
end;
$$;

drop trigger if exists batch_inputs_recompute_cogs on public.batch_inputs;
create trigger batch_inputs_recompute_cogs
  after insert or update or delete on public.batch_inputs
  for each row execute function public.recompute_batch_cogs();

-- ============================================================
-- End of migration 4
-- ============================================================
