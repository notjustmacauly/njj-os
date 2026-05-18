-- ============================================================
-- Inventory Module — Phase 1
-- ingredient_lots: per-receipt stock records with cost
-- batch_inputs.lot_id + cost_per_unit_at_use: link batches to lots
-- receive_supplies RPC: atomic lot + ledger out posting
-- create_batch rewrite: FIFO lot deduction with manual override
-- inventory_on_hand view: per-ingredient totals
-- ============================================================

-- 1) Table -----------------------------------------------------

create table if not exists public.ingredient_lots (
  id                    uuid primary key default gen_random_uuid(),
  external_id           text unique,
  idempotency_key       text unique,
  ingredient_code       text not null references public.ingredients(code),
  received_date         date not null default current_date,
  vendor                text,
  purchase_qty          numeric not null check (purchase_qty > 0),
  purchase_unit         text not null,
  converted_qty         numeric not null check (converted_qty > 0),
  converted_unit        text not null,
  total_cost            numeric not null check (total_cost >= 0),
  cost_per_unit         numeric generated always as (total_cost / converted_qty) stored,
  qty_remaining         numeric not null check (qty_remaining >= 0),
  account_code          text not null references public.accounts(code),
  ledger_entry_id       uuid references public.ledger_entries(id),
  received_by_user_id   uuid,
  received_by_name      text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

comment on table public.ingredient_lots is
  'Per-receipt inventory records. One row per delivery of an ingredient. qty_remaining decremented by batch consumption.';

create index if not exists idx_ingredient_lots_active
  on public.ingredient_lots (ingredient_code, received_date)
  where qty_remaining > 0 and deleted_at is null;
create index if not exists idx_ingredient_lots_account
  on public.ingredient_lots (account_code) where deleted_at is null;

create or replace function public.assign_ingredient_lot_external_id()
returns trigger language plpgsql as $$
declare
  v_seq int;
  v_date_prefix text;
begin
  if new.external_id is not null then return new; end if;
  v_date_prefix := to_char(coalesce(new.received_date, current_date), 'YYMMDD');
  select coalesce(max(substring(external_id from 'LOT-' || v_date_prefix || '-(\d+)')::int), 0) + 1
    into v_seq
    from public.ingredient_lots
   where external_id like 'LOT-' || v_date_prefix || '-%';
  new.external_id := 'LOT-' || v_date_prefix || '-' || lpad(v_seq::text, 3, '0');
  return new;
end; $$;

drop trigger if exists ingredient_lots_assign_external_id on public.ingredient_lots;
create trigger ingredient_lots_assign_external_id
  before insert on public.ingredient_lots
  for each row execute function public.assign_ingredient_lot_external_id();

drop trigger if exists ingredient_lots_set_updated_at on public.ingredient_lots;
create trigger ingredient_lots_set_updated_at
  before update on public.ingredient_lots
  for each row execute function public.set_updated_at();

drop trigger if exists ingredient_lots_audit on public.ingredient_lots;
create trigger ingredient_lots_audit
  after insert or update or delete on public.ingredient_lots
  for each row execute function public.audit_trigger();

alter table public.ingredient_lots enable row level security;

drop policy if exists "operational read ingredient_lots" on public.ingredient_lots;
create policy "operational read ingredient_lots" on public.ingredient_lots
  for select to authenticated
  using (current_user_role() in ('owner','partner','manager') and deleted_at is null);

drop policy if exists "owner manages ingredient_lots" on public.ingredient_lots;
create policy "owner manages ingredient_lots" on public.ingredient_lots
  for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- 2) batch_inputs extension -----------------------------------

alter table public.batch_inputs
  add column if not exists lot_id uuid references public.ingredient_lots(id),
  add column if not exists cost_per_unit_at_use numeric;

comment on column public.batch_inputs.lot_id is
  'The ingredient_lot this input drew from. Null for legacy rows; new rows always populated.';
comment on column public.batch_inputs.cost_per_unit_at_use is
  'Snapshot of lot.cost_per_unit at consumption time. Frozen even if lot is later edited.';

-- 3) receive_supplies RPC -------------------------------------

create or replace function public.receive_supplies(
  p_idempotency_key  text,
  p_ingredient_code  text,
  p_purchase_qty     numeric,
  p_purchase_unit    text,
  p_converted_qty    numeric,
  p_converted_unit   text,
  p_total_cost       numeric,
  p_account_code     text,
  p_received_date    date    default current_date,
  p_vendor           text    default null,
  p_notes            text    default null,
  p_received_by_name text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot_id      uuid;
  v_existing_id uuid;
  v_ledger_id   uuid;
  v_ing         record;
  v_external_id text;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can log received supplies' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.ingredient_lots where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_purchase_qty is null or p_purchase_qty <= 0 then
    raise exception 'purchase_qty must be positive' using errcode = '22023';
  end if;
  if p_converted_qty is null or p_converted_qty <= 0 then
    raise exception 'converted_qty must be positive' using errcode = '22023';
  end if;
  if p_total_cost is null or p_total_cost < 0 then
    raise exception 'total_cost must be non-negative' using errcode = '22023';
  end if;

  select code, name, unit::text as unit, is_active, deleted_at
    into v_ing
    from public.ingredients where code = p_ingredient_code;
  if not found then
    raise exception 'unknown ingredient_code: %', p_ingredient_code using errcode = '23503';
  end if;
  if v_ing.deleted_at is not null or v_ing.is_active = false then
    raise exception 'ingredient % is not active', p_ingredient_code using errcode = '22023';
  end if;
  if lower(v_ing.unit) <> lower(p_converted_unit) then
    raise exception 'converted_unit % does not match ingredient unit % for %',
      p_converted_unit, v_ing.unit, p_ingredient_code using errcode = '22023';
  end if;

  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account_code: %', p_account_code using errcode = '23503';
  end if;

  insert into public.ingredient_lots (
    idempotency_key, ingredient_code, received_date, vendor,
    purchase_qty, purchase_unit, converted_qty, converted_unit,
    total_cost, qty_remaining, account_code,
    received_by_user_id, received_by_name, notes
  ) values (
    p_idempotency_key, p_ingredient_code, p_received_date, p_vendor,
    p_purchase_qty, p_purchase_unit, p_converted_qty, p_converted_unit,
    p_total_cost, p_converted_qty, p_account_code,
    auth.uid(), p_received_by_name, p_notes
  ) returning id, external_id into v_lot_id, v_external_id;

  if p_total_cost > 0 then
    v_ledger_id := public.ledger_apply(
      p_account_code    := p_account_code,
      p_direction       := 'out',
      p_amount          := p_total_cost,
      p_ref_type        := 'supply_receipt',
      p_ref_id          := v_lot_id,
      p_ref_external_id := v_external_id,
      p_description     := 'Supplies: ' || v_ing.name || ' ' || p_converted_qty || p_converted_unit
                         || case when p_vendor is not null then ' from ' || p_vendor else '' end,
      p_idempotency_key := 'supply-receipt-' || v_lot_id::text,
      p_occurred_at     := p_received_date::timestamptz
    );
    update public.ingredient_lots set ledger_entry_id = v_ledger_id where id = v_lot_id;
  end if;

  return v_lot_id;
end; $$;

revoke all on function public.receive_supplies(text, text, numeric, text, numeric, text, numeric, text, date, text, text, text) from public;
grant execute on function public.receive_supplies(text, text, numeric, text, numeric, text, numeric, text, date, text, text, text) to authenticated;

-- 4) Modified create_batch ------------------------------------

create or replace function public.create_batch(
  p_idempotency_key text, p_sku_code text, p_batch_date date default current_date,
  p_units_planned integer default 0, p_units_produced integer default 0, p_wastage integer default 0,
  p_ph numeric default null, p_brix numeric default null, p_qc_passed boolean default null,
  p_qc_notes text default null, p_staff_name text default null, p_notes text default null,
  p_inputs jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch_id     uuid;
  v_existing_id  uuid;
  v_input        jsonb;
  v_code         text;
  v_qty          numeric;
  v_unit         text;
  v_lot_id       uuid;
  v_lot          record;
  v_explicit_lot boolean;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to create batches' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.batches (
    idempotency_key, sku_code, batch_date, units_planned, units_produced, wastage,
    ph, brix, qc_passed, qc_notes, staff_name, staff_user_id, notes
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes, p_staff_name, auth.uid(), p_notes
  ) returning id into v_batch_id;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    v_code := v_input->>'ingredient_code';
    v_qty  := (v_input->>'qty_used')::numeric;
    v_unit := v_input->>'unit';
    v_lot_id := nullif(v_input->>'lot_id', '')::uuid;
    v_explicit_lot := (v_lot_id is not null);

    if v_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid batch input: %', v_input using errcode = '22023';
    end if;

    if v_explicit_lot then
      select id, ingredient_code, qty_remaining, cost_per_unit
        into v_lot from public.ingredient_lots
       where id = v_lot_id and deleted_at is null;
      if not found then
        raise exception 'lot % not found or deleted', v_lot_id using errcode = '23503';
      end if;
      if v_lot.ingredient_code <> v_code then
        raise exception 'lot % is for ingredient %, not %',
          v_lot_id, v_lot.ingredient_code, v_code using errcode = '22023';
      end if;
      if v_lot.qty_remaining < v_qty then
        raise exception 'lot % only has % left, cannot draw %',
          v_lot_id, v_lot.qty_remaining, v_qty using errcode = '22023';
      end if;
    else
      select id, qty_remaining, cost_per_unit
        into v_lot from public.ingredient_lots
       where ingredient_code = v_code
         and qty_remaining >= v_qty
         and deleted_at is null
       order by received_date asc, created_at asc
       limit 1;
      if not found then
        raise exception 'no single lot has enough % for qty % — manually split inputs across lots or log a new receipt first',
          v_code, v_qty using errcode = '22023';
      end if;
      v_lot_id := v_lot.id;
    end if;

    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit,
      lot_id, cost_per_unit_at_use
    ) values (
      v_batch_id, v_code, v_qty, coalesce(v_unit, ''),
      v_lot.cost_per_unit, v_lot_id, v_lot.cost_per_unit
    );

    update public.ingredient_lots
       set qty_remaining = qty_remaining - v_qty
     where id = v_lot_id;
  end loop;

  return v_batch_id;
end; $$;

revoke all on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) from public;
grant execute on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) to authenticated;

-- 5) inventory_on_hand view -----------------------------------

create or replace view public.inventory_on_hand as
  select
    i.code,
    i.name,
    i.unit,
    i.type::text                          as ingredient_type,
    coalesce(sum(l.qty_remaining), 0)     as qty_on_hand,
    count(l.id) filter (where l.qty_remaining > 0) as active_lots,
    max(l.received_date)                  as last_received_date,
    case
      when sum(l.qty_remaining) > 0 then
        sum(l.qty_remaining * l.cost_per_unit) / sum(l.qty_remaining)
      else null
    end                                   as avg_cost_per_unit
  from public.ingredients i
  left join public.ingredient_lots l
    on l.ingredient_code = i.code
   and l.deleted_at is null
   and l.qty_remaining > 0
  where i.deleted_at is null and i.is_active = true
  group by i.code, i.name, i.unit, i.type;

alter view public.inventory_on_hand set (security_invoker = true);
comment on view public.inventory_on_hand is
  'Per-ingredient stock totals. Security_invoker so RLS on ingredient_lots applies (Manager sees totals, Staff sees nothing).';
