-- ============================================================
-- NJJ OS v2 — Migration 3: Partners
-- ============================================================
--   partner_tiers   — pricing tiers (A, B, C, D) with default prices per SKU
--   partners        — B2B customer registry, with optional per-partner price overrides
--   partner_price_for_sku() — resolves the right price using the fallback chain:
--                             partner override → tier default → SKU retail price
--
-- External IDs ('B2B-001', 'B2B-002', ...) auto-assigned via sequence on
-- insert if not provided. Soft-delete via `deleted_at`.
-- ============================================================

-- ── partner_tiers ───────────────────────────────────────────
create table if not exists public.partner_tiers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- 'A', 'B', 'C', 'D'
  name        text not null,               -- 'Tier A'
  price_pcl   numeric(12,2) not null,
  price_acg   numeric(12,2) not null,
  price_wpm   numeric(12,2) not null,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.partner_tiers is
  'Pricing tiers for B2B partners. Per-partner overrides on the partners table take precedence over tier defaults.';

drop trigger if exists partner_tiers_set_updated_at on public.partner_tiers;
create trigger partner_tiers_set_updated_at
  before update on public.partner_tiers
  for each row execute function public.set_updated_at();

drop trigger if exists partner_tiers_audit on public.partner_tiers;
create trigger partner_tiers_audit
  after insert or update or delete on public.partner_tiers
  for each row execute function public.audit_trigger();

alter table public.partner_tiers enable row level security;

drop policy if exists "all read partner_tiers" on public.partner_tiers;
create policy "all read partner_tiers"
  on public.partner_tiers for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "admin manages partner_tiers" on public.partner_tiers;
create policy "admin manages partner_tiers"
  on public.partner_tiers for all
  to authenticated
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

insert into public.partner_tiers (code, name, price_pcl, price_acg, price_wpm) values
  ('A', 'Tier A', 150, 150, 150),
  ('B', 'Tier B', 140, 140, 140),
  ('C', 'Tier C', 130, 130, 130),
  ('D', 'Tier D', 120, 120, 120)
on conflict (code) do nothing;

-- ── partners ────────────────────────────────────────────────
create sequence if not exists public.partners_external_id_seq start 1;

create table if not exists public.partners (
  id              uuid primary key default gen_random_uuid(),
  external_id     text unique,                                       -- 'B2B-001', auto-assigned if blank
  name            text not null,
  city            text,
  tier_code       text not null references public.partner_tiers(code),
  delivery_fee    numeric(12,2) not null default 0 check (delivery_fee >= 0),
  contact         text,                                              -- phone or short text
  email           text,
  address         text,
  price_pcl       numeric(12,2),                                     -- null = use tier default
  price_acg       numeric(12,2),
  price_wpm       numeric(12,2),
  notes           text,
  is_active       boolean not null default true,
  deleted_at      timestamptz,                                       -- soft delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.partners is
  'B2B customer registry. tier_code drives default per-can pricing; price_pcl/acg/wpm columns override per-SKU when set.';

create index if not exists idx_partners_active on public.partners (is_active) where deleted_at is null;
create index if not exists idx_partners_tier   on public.partners (tier_code);
create index if not exists idx_partners_name   on public.partners using gin (name gin_trgm_ops);

drop trigger if exists partners_set_updated_at on public.partners;
create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

drop trigger if exists partners_audit on public.partners;
create trigger partners_audit
  after insert or update or delete on public.partners
  for each row execute function public.audit_trigger();

-- Auto-assign external_id on insert if not provided
create or replace function public.assign_partner_external_id()
returns trigger
language plpgsql
as $$
begin
  if new.external_id is null or new.external_id = '' then
    new.external_id := 'B2B-' || lpad(
      nextval('public.partners_external_id_seq')::text,
      3, '0'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists partners_assign_external_id on public.partners;
create trigger partners_assign_external_id
  before insert on public.partners
  for each row execute function public.assign_partner_external_id();

alter table public.partners enable row level security;

drop policy if exists "ops+ read partners" on public.partners;
create policy "ops+ read partners"
  on public.partners for select
  to authenticated
  using (
    current_user_role() in ('admin','manager','ops')
    and deleted_at is null
  );

drop policy if exists "admin+manager manage partners" on public.partners;
create policy "admin+manager manage partners"
  on public.partners for all
  to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- ── partner_price_for_sku() ─────────────────────────────────
-- Resolves a partner's effective price for a given SKU using the fallback
-- chain: partner override → tier default → SKU retail price. Used by the
-- order-total computation in subsequent migrations.
create or replace function public.partner_price_for_sku(
  p_partner_id uuid,
  p_sku_code   text
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override   numeric;
  v_tier_code  text;
  v_tier_price numeric;
  v_retail     numeric;
begin
  -- 1. Partner override?
  select
    case p_sku_code
      when 'PCL' then price_pcl
      when 'ACG' then price_acg
      when 'WPM' then price_wpm
    end,
    tier_code
  into v_override, v_tier_code
  from public.partners
  where id = p_partner_id;

  if v_override is not null then
    return v_override;
  end if;

  -- 2. Tier default?
  if v_tier_code is not null then
    select
      case p_sku_code
        when 'PCL' then price_pcl
        when 'ACG' then price_acg
        when 'WPM' then price_wpm
      end
    into v_tier_price
    from public.partner_tiers
    where code = v_tier_code;

    if v_tier_price is not null then
      return v_tier_price;
    end if;
  end if;

  -- 3. SKU retail price fallback
  select retail_price into v_retail
  from public.skus
  where code = p_sku_code;

  return v_retail;
end;
$$;

comment on function public.partner_price_for_sku is
  'Resolves effective per-can price for a partner+SKU combo. Order: partner override → tier default → SKU retail.';

revoke all on function public.partner_price_for_sku(uuid, text) from public;
grant  execute on function public.partner_price_for_sku(uuid, text) to authenticated;

-- ============================================================
-- End of migration 3
-- ============================================================
