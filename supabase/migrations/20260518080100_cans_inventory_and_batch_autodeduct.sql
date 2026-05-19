-- ============================================================
-- Cans as packaging inventory + auto-deduct in create_batch.
-- - skus.can_ingredient_code → which can each SKU consumes
-- - Three new ingredient codes: CAN_PCL, CAN_ACG, CAN_WPM (unit='unit')
-- - create_batch auto-adds a packaging input matching units_produced
--   (unless caller has already included that ingredient in p_inputs)
-- ============================================================

alter table public.skus
  add column if not exists can_ingredient_code text references public.ingredients(code);

comment on column public.skus.can_ingredient_code is
  'Which packaging ingredient (can SKU) this product uses. NULL = no auto-deduct at batch time.';

insert into public.ingredients (code, name, type, unit, is_active) values
  ('CAN_PCL', 'PCL Can', 'packaging', 'unit', true),
  ('CAN_ACG', 'ACG Can', 'packaging', 'unit', true),
  ('CAN_WPM', 'WPM Can', 'packaging', 'unit', true)
on conflict (code) do update set
  name = excluded.name, type = excluded.type, unit = excluded.unit,
  is_active = true, deleted_at = null;

update public.skus set can_ingredient_code = 'CAN_PCL' where code = 'PCL';
update public.skus set can_ingredient_code = 'CAN_ACG' where code = 'ACG';
update public.skus set can_ingredient_code = 'CAN_WPM' where code = 'WPM';

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
  v_can_code     text;
  v_can_already  boolean := false;
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

  select can_ingredient_code into v_can_code from public.skus where code = p_sku_code;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    v_code := v_input->>'ingredient_code';
    v_qty  := (v_input->>'qty_used')::numeric;
    v_unit := v_input->>'unit';
    v_lot_id := nullif(v_input->>'lot_id', '')::uuid;
    v_explicit_lot := (v_lot_id is not null);

    if v_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid batch input: %', v_input using errcode = '22023';
    end if;

    if v_can_code is not null and v_code = v_can_code then
      v_can_already := true;
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

  if v_can_code is not null and coalesce(p_units_produced, 0) > 0 and not v_can_already then
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

  return v_batch_id;
end; $$;

revoke all on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) from public;
grant execute on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) to authenticated;
