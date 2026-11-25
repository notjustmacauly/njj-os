-- Cup-juice product tracking + production QC additions.
--
-- Leftover dispenser juice (sold at markets as Small/Large cups) becomes a real,
-- costed inventory item. Cups + lids are packaging inventory. POS deducts cup +
-- lid + juice-ml on every cup sold, like it already does for bottled water.
-- Production splits each batch's juice cost by volume between the canned units
-- and the leftover poured to the dispenser, so cans stop absorbing juice that
-- actually became cups — and both products get a real margin.
--
-- Also adds a Taste pass/fail check and the name of who verified QC.

-- 1. Produced (in-house) lots have no funding account — relax the NOT NULL.
alter table public.ingredient_lots alter column account_code drop not null;

-- 2. New inventory items: cups, one shared lid, and dispenser juice (in ml).
insert into public.ingredients (code, name, type, unit, cost_per_unit, is_active, notes)
values
  ('PKG_CUP_SM', 'Small Cup (12oz)', 'packaging', 'unit', 0, true, 'Plastic cup for Small juice cup'),
  ('PKG_CUP_LG', 'Large Cup (16oz)', 'packaging', 'unit', 0, true, 'Plastic cup for Large juice cup'),
  ('PKG_LID',    'Cup Lid',          'packaging', 'unit', 0, true, 'Lid — fits both cup sizes'),
  ('JUICE_DISP', 'Dispenser Juice',  'other',     'mL', 0, true, 'Leftover juice held in the dispenser, produced by batches. Measured in mL.')
on conflict (code) do nothing;

-- 3. Production QC + dispenser columns.
alter table public.batches
  add column if not exists dispenser_ml   numeric(12,2) not null default 0,
  add column if not exists dispenser_cost numeric(12,2) not null default 0,
  add column if not exists taste_passed   boolean,
  add column if not exists qc_verified_by text;

comment on column public.batches.dispenser_ml is
  'Leftover juice (ml) poured to the dispenser from this batch.';
comment on column public.batches.dispenser_cost is
  'Share of the batch juice cost allocated to the dispenser juice (relieved from cans).';
comment on column public.batches.taste_passed is 'Taste QC check: true pass / false fail.';
comment on column public.batches.qc_verified_by is 'Name of the person who verified the QC check.';

-- 4. Cup recipe config — how much cup/lid/juice each POS cup size consumes.
create table if not exists public.cup_specs (
  size       text primary key check (size in ('sm', 'lg')),
  cup_code   text not null references public.ingredients(code),
  lid_code   text not null references public.ingredients(code),
  juice_ml   numeric(10,2) not null default 0 check (juice_ml >= 0),
  updated_at timestamptz not null default now()
);

insert into public.cup_specs (size, cup_code, lid_code, juice_ml) values
  ('sm', 'PKG_CUP_SM', 'PKG_LID', 140),
  ('lg', 'PKG_CUP_LG', 'PKG_LID', 200)
on conflict (size) do nothing;

alter table public.cup_specs enable row level security;

drop policy if exists cup_specs_read on public.cup_specs;
create policy cup_specs_read on public.cup_specs
  for select using (auth.uid() is not null);

drop policy if exists cup_specs_write on public.cup_specs;
create policy cup_specs_write on public.cup_specs
  for all using (coalesce(current_user_role()::text, '') in ('owner', 'partner'))
  with check (coalesce(current_user_role()::text, '') in ('owner', 'partner'));

-- 5. POS cup deduction — mirrors pos_sync_water_stock. Each Small cup draws
-- 1 small cup + 1 lid + juice_ml of dispenser juice; each Large cup the same
-- with the large cup + its juice_ml. Fail-safe: any error is swallowed so a
-- sale is never blocked by a stock hiccup.
create or replace function public.pos_sync_cup_stock()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_old_sm int; v_new_sm int; v_d_sm int;
  v_old_lg int; v_new_lg int; v_d_lg int;
  v_sm record; v_lg record;
begin
  v_old_sm := case when tg_op = 'INSERT' then 0 else coalesce(old.cup_sm_qty, 0) end;
  if tg_op <> 'INSERT' and old.deleted_at is not null then v_old_sm := 0; end if;
  v_new_sm := coalesce(new.cup_sm_qty, 0);
  if new.deleted_at is not null then v_new_sm := 0; end if;
  v_d_sm := v_new_sm - v_old_sm;

  v_old_lg := case when tg_op = 'INSERT' then 0 else coalesce(old.cup_lg_qty, 0) end;
  if tg_op <> 'INSERT' and old.deleted_at is not null then v_old_lg := 0; end if;
  v_new_lg := coalesce(new.cup_lg_qty, 0);
  if new.deleted_at is not null then v_new_lg := 0; end if;
  v_d_lg := v_new_lg - v_old_lg;

  if v_d_sm <> 0 then
    select cup_code, lid_code, juice_ml into v_sm from public.cup_specs where size = 'sm';
    if found then
      perform public.apply_resale_stock_change(v_sm.cup_code, -v_d_sm);
      perform public.apply_resale_stock_change(v_sm.lid_code, -v_d_sm);
      if v_sm.juice_ml > 0 then
        perform public.apply_resale_stock_change('JUICE_DISP', -(v_d_sm * v_sm.juice_ml));
      end if;
    end if;
  end if;

  if v_d_lg <> 0 then
    select cup_code, lid_code, juice_ml into v_lg from public.cup_specs where size = 'lg';
    if found then
      perform public.apply_resale_stock_change(v_lg.cup_code, -v_d_lg);
      perform public.apply_resale_stock_change(v_lg.lid_code, -v_d_lg);
      if v_lg.juice_ml > 0 then
        perform public.apply_resale_stock_change('JUICE_DISP', -(v_d_lg * v_lg.juice_ml));
      end if;
    end if;
  end if;

  return null;
exception when others then return null;
end; $function$;

drop trigger if exists pos_sync_cup_stock_trg on public.pos_transactions;
create trigger pos_sync_cup_stock_trg
  after insert or update on public.pos_transactions
  for each row execute function public.pos_sync_cup_stock();

-- 6. Allocate a batch's juice cost to the dispenser by volume, and add the
-- leftover juice to stock at its true per-ml cost (relieving the cans of that
-- share). Called from create_batch (direct finalize) and finalize_batch.
create or replace function public.allocate_dispenser_juice(
  p_batch_id uuid, p_dispenser_ml numeric, p_label text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_batch       record;
  v_can_code    text;
  v_size_ml     int;
  v_juice_cost  numeric;
  v_canned_ml   numeric;
  v_total_ml    numeric;
  v_cost_per_ml numeric := 0;
  v_disp_cost   numeric := 0;
begin
  select sku_code, batch_date, external_id, staff_name, coalesce(units_produced, 0) as units_produced
    into v_batch from public.batches where id = p_batch_id;
  if not found then return; end if;

  select can_ingredient_code, size_ml into v_can_code, v_size_ml
    from public.skus where code = v_batch.sku_code;

  if coalesce(p_dispenser_ml, 0) > 0 then
    -- Juice cost = all batch inputs except the can container.
    select coalesce(sum(subtotal), 0) into v_juice_cost
      from public.batch_inputs
     where batch_id = p_batch_id
       and (v_can_code is null or ingredient_code <> v_can_code);

    v_canned_ml := v_batch.units_produced * coalesce(v_size_ml, 0);
    v_total_ml  := v_canned_ml + p_dispenser_ml;
    if v_total_ml > 0 then
      v_cost_per_ml := v_juice_cost / v_total_ml;
    end if;
    v_disp_cost := round(v_cost_per_ml * p_dispenser_ml, 2);

    insert into public.ingredient_lots (
      ingredient_code, received_date, vendor, purchase_qty, purchase_unit,
      converted_qty, converted_unit, total_cost, cost_per_unit, qty_remaining,
      account_code, received_by_name, notes
    ) values (
      'JUICE_DISP', v_batch.batch_date, 'In-house production', p_dispenser_ml, 'mL',
      p_dispenser_ml, 'mL', v_disp_cost, v_cost_per_ml, p_dispenser_ml,
      null, coalesce(p_label, v_batch.staff_name),
      'From batch ' || coalesce(v_batch.external_id, '')
    );
  end if;

  update public.batches
     set dispenser_ml   = coalesce(p_dispenser_ml, 0),
         dispenser_cost = v_disp_cost,
         updated_at     = now()
   where id = p_batch_id;
end; $function$;

revoke all on function public.allocate_dispenser_juice(uuid, numeric, text) from public;
grant execute on function public.allocate_dispenser_juice(uuid, numeric, text) to authenticated;

-- 7. finalize_batch — add dispenser + taste + verified-by, allocate juice.
drop function if exists public.finalize_batch(uuid, integer, integer, numeric, numeric, boolean, text);
create or replace function public.finalize_batch(
  p_batch_id uuid,
  p_units_produced integer,
  p_wastage integer default 0,
  p_ph numeric default null,
  p_brix numeric default null,
  p_qc_passed boolean default null,
  p_qc_notes text default null,
  p_dispenser_ml numeric default 0,
  p_taste_passed boolean default null,
  p_qc_verified_by text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_batch        record;
  v_input        record;
  v_lot          record;
  v_lot_id       uuid;
  v_explicit_lot boolean;
  v_can_code     text;
  v_can_already  boolean := false;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner') then
    raise exception 'only owner or partner can finalize a batch' using errcode = '42501';
  end if;

  select * into v_batch from public.batches
   where id = p_batch_id and deleted_at is null;
  if not found then
    raise exception 'batch not found' using errcode = '23503';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'batch is not a draft (status = %)', v_batch.status using errcode = '22023';
  end if;
  if p_units_produced is null or p_units_produced < 0 then
    raise exception 'units_produced is required and must be >= 0' using errcode = '22023';
  end if;

  select can_ingredient_code into v_can_code from public.skus where code = v_batch.sku_code;

  for v_input in
    select * from public.batch_inputs where batch_id = p_batch_id
  loop
    v_lot_id := v_input.lot_id;
    v_explicit_lot := (v_lot_id is not null);

    if v_can_code is not null and v_input.ingredient_code = v_can_code then
      v_can_already := true;
    end if;

    if v_explicit_lot then
      select id, ingredient_code, qty_remaining, cost_per_unit
        into v_lot from public.ingredient_lots
       where id = v_lot_id and deleted_at is null;
      if not found then
        raise exception 'lot % not found or deleted', v_lot_id using errcode = '23503';
      end if;
      if v_lot.ingredient_code <> v_input.ingredient_code then
        raise exception 'lot % is for ingredient %, not %',
          v_lot_id, v_lot.ingredient_code, v_input.ingredient_code using errcode = '22023';
      end if;
      if v_lot.qty_remaining < v_input.qty_used then
        raise exception 'lot % only has % left, cannot draw %',
          v_lot_id, v_lot.qty_remaining, v_input.qty_used using errcode = '22023';
      end if;
    else
      select id, qty_remaining, cost_per_unit
        into v_lot from public.ingredient_lots
       where ingredient_code = v_input.ingredient_code
         and qty_remaining >= v_input.qty_used
         and deleted_at is null
       order by received_date asc, created_at asc
       limit 1;
      if not found then
        raise exception 'no single lot has enough % for qty % — split the draft input across lots or log a new receipt',
          v_input.ingredient_code, v_input.qty_used using errcode = '22023';
      end if;
      v_lot_id := v_lot.id;
    end if;

    update public.batch_inputs
       set lot_id                = v_lot_id,
           cost_per_unit         = v_lot.cost_per_unit,
           cost_per_unit_at_use  = v_lot.cost_per_unit
     where id = v_input.id;

    update public.ingredient_lots
       set qty_remaining = qty_remaining - v_input.qty_used
     where id = v_lot_id;
  end loop;

  if v_can_code is not null
     and p_units_produced > 0
     and not v_can_already then
    select id, qty_remaining, cost_per_unit
      into v_lot from public.ingredient_lots
     where ingredient_code = v_can_code
       and qty_remaining >= p_units_produced
       and deleted_at is null
     order by received_date asc, created_at asc
     limit 1;
    if not found then
      raise exception 'not enough % in a single lot for % cans — receive a fresh lot first',
        v_can_code, p_units_produced using errcode = '22023';
    end if;

    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit,
      lot_id, cost_per_unit_at_use
    ) values (
      p_batch_id, v_can_code, p_units_produced, 'unit',
      v_lot.cost_per_unit, v_lot.id, v_lot.cost_per_unit
    );

    update public.ingredient_lots
       set qty_remaining = qty_remaining - p_units_produced
     where id = v_lot.id;
  end if;

  update public.batches
     set status               = 'finalized',
         units_produced       = p_units_produced,
         wastage              = coalesce(p_wastage, 0),
         ph                   = p_ph,
         brix                 = p_brix,
         qc_passed            = p_qc_passed,
         qc_notes             = p_qc_notes,
         taste_passed         = p_taste_passed,
         qc_verified_by       = p_qc_verified_by,
         finalized_at         = now(),
         finalized_by_user_id = auth.uid(),
         updated_at           = now()
   where id = p_batch_id;

  -- cogs_total is kept current by the batch_inputs trigger; recompute directly
  -- here (there is no uuid-arg overload of recompute_batch_cogs) before we split
  -- the juice cost to the dispenser.
  update public.batches
     set cogs_total = coalesce((select sum(subtotal) from public.batch_inputs where batch_id = p_batch_id), 0)
   where id = p_batch_id;

  perform public.allocate_dispenser_juice(p_batch_id, coalesce(p_dispenser_ml, 0), p_qc_verified_by);
end; $function$;

revoke all on function public.finalize_batch(uuid, integer, integer, numeric, numeric, boolean, text, numeric, boolean, text) from public;
grant execute on function public.finalize_batch(uuid, integer, integer, numeric, numeric, boolean, text, numeric, boolean, text) to authenticated;

-- 8. create_batch — single extended version (owner/partner direct finalize).
-- Replaces the prior 13-arg and 14-arg overloads.
drop function if exists public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb);
drop function if exists public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb, boolean);
create or replace function public.create_batch(
  p_idempotency_key text,
  p_sku_code text,
  p_batch_date date default current_date,
  p_units_planned integer default 0,
  p_units_produced integer default 0,
  p_wastage integer default 0,
  p_ph numeric default null,
  p_brix numeric default null,
  p_qc_passed boolean default null,
  p_qc_notes text default null,
  p_staff_name text default null,
  p_notes text default null,
  p_inputs jsonb default '[]'::jsonb,
  p_is_backfill boolean default false,
  p_dispenser_ml numeric default 0,
  p_taste_passed boolean default null,
  p_qc_verified_by text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_batch_id     uuid;
  v_existing_id  uuid;
  v_input        jsonb;
  v_code         text;
  v_qty          numeric;
  v_unit         text;
  v_cost_est     numeric;
  v_lot_id       uuid;
  v_lot          record;
  v_explicit_lot boolean;
  v_can_code     text;
  v_can_already  boolean := false;
  v_is_backfill  boolean := coalesce(p_is_backfill, false);
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner') then
    raise exception 'only owner or partner can create a finalized batch directly — use create_draft_batch instead'
      using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.batches (
    idempotency_key, sku_code, batch_date, units_planned, units_produced, wastage,
    ph, brix, qc_passed, qc_notes, staff_name, staff_user_id, notes, is_backfill,
    status, finalized_at, finalized_by_user_id, taste_passed, qc_verified_by
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes, p_staff_name, auth.uid(), p_notes, v_is_backfill,
    'finalized', now(), auth.uid(), p_taste_passed, p_qc_verified_by
  ) returning id into v_batch_id;

  select can_ingredient_code into v_can_code from public.skus where code = p_sku_code;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    v_code := v_input->>'ingredient_code';
    v_qty  := (v_input->>'qty_used')::numeric;
    v_unit := v_input->>'unit';
    v_cost_est := nullif(v_input->>'cost_per_unit', '')::numeric;
    v_lot_id := nullif(v_input->>'lot_id', '')::uuid;
    v_explicit_lot := (v_lot_id is not null);

    if v_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid batch input: %', v_input using errcode = '22023';
    end if;

    if v_can_code is not null and v_code = v_can_code then
      v_can_already := true;
    end if;

    if v_is_backfill then
      insert into public.batch_inputs (
        batch_id, ingredient_code, qty_used, unit, cost_per_unit,
        lot_id, cost_per_unit_at_use
      ) values (
        v_batch_id, v_code, v_qty, coalesce(v_unit, ''),
        coalesce(v_cost_est, 0), null, v_cost_est
      );
    else
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
    end if;
  end loop;

  if not v_is_backfill
     and v_can_code is not null
     and coalesce(p_units_produced, 0) > 0
     and not v_can_already then
    select id, qty_remaining, cost_per_unit
      into v_lot from public.ingredient_lots
     where ingredient_code = v_can_code
       and qty_remaining >= p_units_produced
       and deleted_at is null
     order by received_date asc, created_at asc
     limit 1;
    if not found then
      raise exception 'not enough % in a single lot for % cans — receive a fresh lot first',
        v_can_code, p_units_produced using errcode = '22023';
    end if;

    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit,
      lot_id, cost_per_unit_at_use
    ) values (
      v_batch_id, v_can_code, p_units_produced, 'unit',
      v_lot.cost_per_unit, v_lot.id, v_lot.cost_per_unit
    );

    update public.ingredient_lots
       set qty_remaining = qty_remaining - p_units_produced
     where id = v_lot.id;
  end if;

  perform public.allocate_dispenser_juice(v_batch_id, coalesce(p_dispenser_ml, 0), p_qc_verified_by);

  return v_batch_id;
end; $function$;

revoke all on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb, boolean, numeric, boolean, text) from public;
grant execute on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb, boolean, numeric, boolean, text) to authenticated;

-- 9. Cup product report: per month + size, units / revenue / cost of cup, lid,
-- and juice (juice valued at the weighted-average produced cost per ml;
-- cup & lid at their weighted-average purchase cost).
create or replace function public.report_cup_products()
returns table (
  month date, size text, units bigint, revenue numeric,
  cup_cost numeric, lid_cost numeric, juice_cost numeric
) language sql stable security definer set search_path to 'public' as $function$
  with avg_costs as (
    select ingredient_code,
           coalesce(sum(total_cost) / nullif(sum(converted_qty), 0), 0) as avg_cost
      from public.ingredient_lots
     where deleted_at is null
     group by ingredient_code
  ),
  juice_avg as (
    select coalesce(sum(total_cost) / nullif(sum(converted_qty), 0), 0) as per_ml
      from public.ingredient_lots
     where ingredient_code = 'JUICE_DISP' and deleted_at is null
  ),
  sales as (
    select date_trunc('month', t.transaction_at)::date as month,
           case when i.item_type = 'cup_sm' then 'sm' else 'lg' end as size,
           sum(i.qty)::bigint as units,
           sum(i.subtotal) as revenue
      from public.pos_transaction_items i
      join public.pos_transactions t on t.id = i.transaction_id
     where t.deleted_at is null
       and i.item_type in ('cup_sm', 'cup_lg')
     group by 1, 2
  )
  select s.month, s.size, s.units, s.revenue,
         s.units * coalesce(ac.avg_cost, 0)                         as cup_cost,
         s.units * coalesce(al.avg_cost, 0)                         as lid_cost,
         s.units * sp.juice_ml * (select per_ml from juice_avg)     as juice_cost
    from sales s
    join public.cup_specs sp on sp.size = s.size
    left join avg_costs ac on ac.ingredient_code = sp.cup_code
    left join avg_costs al on al.ingredient_code = sp.lid_code
   order by s.month, s.size;
$function$;

revoke all on function public.report_cup_products() from public;
grant execute on function public.report_cup_products() to authenticated;
