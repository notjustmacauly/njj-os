-- ============================================================
-- NJJ OS v2 — Migration 8: Deductions + Inventory View
-- ============================================================
--   deductions          — non-sale outflows (marketing samples, comps, wastage)
--   deduction_items     — line items per deduction (one per SKU)
--   inventory_summary   — VIEW: batch.units_produced minus all consumption
--                         (orders + POS juice items + deductions)
--
-- Same parent/child + maintained-columns pattern as orders and POS, so
-- inventory math stays consistent everywhere.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'deduction_type') then
    create type public.deduction_type as enum ('marketing','comps','wastage','damage','other');
  end if;
end$$;

-- ── deductions ──────────────────────────────────────────────
create sequence if not exists public.deductions_external_id_seq start 1;

create table if not exists public.deductions (
  id            uuid primary key default gen_random_uuid(),
  external_id   text unique,                                          -- 'DED-260505-001'
  deduction_date date not null default current_date,
  type          public.deduction_type not null default 'marketing',
  recipient     text,                                                  -- "Influencer X", "Cebu Pet Show", etc.
  -- Maintained columns from deduction_items
  pcl_qty       integer not null default 0,
  acg_qty       integer not null default 0,
  wpm_qty       integer not null default 0,
  total_qty     integer not null default 0,
  est_value     numeric(12,2) not null default 0,                      -- maintained: sum(qty * sku.retail_price)
  notes         text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.deductions is
  'Non-sale outflows that reduce inventory (marketing samples, comps, wastage). No money flow — purely inventory accounting.';

create index if not exists idx_deductions_date on public.deductions (deduction_date desc) where deleted_at is null;
create index if not exists idx_deductions_type on public.deductions (type) where deleted_at is null;

drop trigger if exists deductions_set_updated_at on public.deductions;
create trigger deductions_set_updated_at before update on public.deductions for each row execute function public.set_updated_at();

drop trigger if exists deductions_audit on public.deductions;
create trigger deductions_audit after insert or update or delete on public.deductions for each row execute function public.audit_trigger();

create or replace function public.assign_deduction_external_id()
returns trigger language plpgsql as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.deduction_date, current_date), 'YYMMDD');
    new.external_id := 'DED-' || v_date_part || '-' ||
      lpad(nextval('public.deductions_external_id_seq')::text, 3, '0');
  end if;
  return new;
end; $$;

drop trigger if exists deductions_assign_external_id on public.deductions;
create trigger deductions_assign_external_id before insert on public.deductions
  for each row execute function public.assign_deduction_external_id();

alter table public.deductions enable row level security;

drop policy if exists "ops+ read deductions" on public.deductions;
create policy "ops+ read deductions" on public.deductions for select to authenticated
  using (current_user_role() in ('admin','manager','ops') and deleted_at is null);

drop policy if exists "admin+manager manage deductions" on public.deductions;
create policy "admin+manager manage deductions" on public.deductions for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

-- ── deduction_items ─────────────────────────────────────────
create table if not exists public.deduction_items (
  id            uuid primary key default gen_random_uuid(),
  deduction_id  uuid not null references public.deductions(id) on delete cascade,
  sku_code      text not null references public.skus(code),
  qty           integer not null check (qty > 0),
  batch_id      uuid references public.batches(id) on delete set null,        -- which batch was deducted from
  notes         text,
  created_at    timestamptz not null default now(),
  unique (deduction_id, sku_code)
);

comment on table public.deduction_items is
  'Per-SKU deduction lines. batch_id is optional but encouraged for inventory accuracy.';

create index if not exists idx_deduction_items_ded   on public.deduction_items (deduction_id);
create index if not exists idx_deduction_items_sku   on public.deduction_items (sku_code);
create index if not exists idx_deduction_items_batch on public.deduction_items (batch_id) where batch_id is not null;

drop trigger if exists deduction_items_audit on public.deduction_items;
create trigger deduction_items_audit after insert or update or delete on public.deduction_items
  for each row execute function public.audit_trigger();

alter table public.deduction_items enable row level security;

drop policy if exists "ops+ read deduction_items" on public.deduction_items;
create policy "ops+ read deduction_items" on public.deduction_items for select to authenticated
  using (current_user_role() in ('admin','manager','ops'));

drop policy if exists "admin+manager manage deduction_items" on public.deduction_items;
create policy "admin+manager manage deduction_items" on public.deduction_items for all to authenticated
  using (current_user_role() in ('admin','manager')) with check (current_user_role() in ('admin','manager'));

-- ── recompute_deduction_totals ──────────────────────────────
create or replace function public.recompute_deduction_totals(p_ded_id uuid)
returns void language plpgsql as $$
declare
  v_pcl integer; v_acg integer; v_wpm integer; v_total integer; v_est numeric(12,2);
begin
  select
    coalesce(sum(qty) filter (where sku_code = 'PCL'), 0),
    coalesce(sum(qty) filter (where sku_code = 'ACG'), 0),
    coalesce(sum(qty) filter (where sku_code = 'WPM'), 0),
    coalesce(sum(qty), 0),
    coalesce(sum(di.qty * s.retail_price), 0)
  into v_pcl, v_acg, v_wpm, v_total, v_est
  from public.deduction_items di
  join public.skus s on s.code = di.sku_code
  where di.deduction_id = p_ded_id;

  update public.deductions
    set pcl_qty = v_pcl, acg_qty = v_acg, wpm_qty = v_wpm,
        total_qty = v_total, est_value = v_est
    where id = p_ded_id;
end; $$;

create or replace function public.deduction_items_after_change()
returns trigger language plpgsql as $$
declare v_ded_id uuid;
begin
  v_ded_id := coalesce((new).deduction_id, (old).deduction_id);
  perform public.recompute_deduction_totals(v_ded_id);
  return null;
end; $$;

drop trigger if exists deduction_items_recompute on public.deduction_items;
create trigger deduction_items_recompute
  after insert or update or delete on public.deduction_items
  for each row execute function public.deduction_items_after_change();

-- ── inventory_summary VIEW ──────────────────────────────────
-- Single source of truth for "how many cans are left in batch X".
-- Combines: batch.units_produced − sold via orders − sold via POS juice − deducted.
-- Uses security_invoker (default) so the caller's RLS on each underlying
-- table is respected — staff sees only what they're allowed to see.
create or replace view public.inventory_summary as
with order_use as (
  select batch_id, sum(qty) as qty
  from public.order_items
  where batch_id is not null
  group by batch_id
),
pos_use as (
  select batch_id, sum(qty) as qty
  from public.pos_transaction_items
  where batch_id is not null and item_type = 'juice'
  group by batch_id
),
deduction_use as (
  select batch_id, sum(qty) as qty
  from public.deduction_items
  where batch_id is not null
  group by batch_id
)
select
  b.id                                    as batch_id,
  b.external_id                           as batch_external_id,
  b.batch_date,
  b.sku_code,
  b.units_produced,
  coalesce(o.qty, 0)                      as sold_via_orders,
  coalesce(p.qty, 0)                      as sold_via_pos,
  coalesce(d.qty, 0)                      as deducted,
  greatest(
    b.units_produced - coalesce(o.qty, 0) - coalesce(p.qty, 0) - coalesce(d.qty, 0),
    0
  )                                       as remaining,
  b.units_produced - coalesce(o.qty, 0) - coalesce(p.qty, 0) - coalesce(d.qty, 0)
                                          as remaining_signed,  -- negative = oversold
  b.cogs_total,
  b.qc_passed,
  b.deleted_at
from public.batches b
left join order_use     o on o.batch_id = b.id
left join pos_use       p on p.batch_id = b.id
left join deduction_use d on d.batch_id = b.id
where b.deleted_at is null;

comment on view public.inventory_summary is
  'Per-batch remaining inventory. remaining = units_produced − orders − POS − deductions, floored at 0. remaining_signed shows negative when oversold (alert condition).';

-- ============================================================
-- End of migration 8
-- ============================================================
