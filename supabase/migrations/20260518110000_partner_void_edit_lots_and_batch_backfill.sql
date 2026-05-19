-- =================================================================
-- 1) Partner can void lots (was Owner-only)
-- 2) New edit_ingredient_lot_cosmetic for vendor/date/notes edits
-- 3) batches.is_backfill flag + create_batch supports backfill mode
-- =================================================================

create or replace function public.void_ingredient_lot(
  p_lot_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot          record;
  v_consumed_n   int;
  v_reversal_id  uuid;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can void ingredient lots' using errcode = '42501';
  end if;

  select * into v_lot from public.ingredient_lots where id = p_lot_id;
  if not found then
    raise exception 'lot not found: %', p_lot_id using errcode = '23503';
  end if;

  if v_lot.deleted_at is not null then
    return jsonb_build_object('lot_id', p_lot_id, 'already_voided', true, 'voided_at', v_lot.deleted_at);
  end if;

  if not public.user_can_use_account(v_lot.account_code) then
    raise exception 'you do not have access to the account this lot was paid from (%)', v_lot.account_code using errcode = '42501';
  end if;

  select count(*) into v_consumed_n
    from public.batch_inputs where lot_id = p_lot_id;

  if v_consumed_n > 0 then
    raise exception
      'lot has been consumed by % batch input(s) — use a manual ledger correction instead of voiding',
      v_consumed_n using errcode = '22023';
  end if;

  if v_lot.ledger_entry_id is not null then
    v_reversal_id := public.ledger_apply(
      p_account_code    := v_lot.account_code,
      p_direction       := 'in',
      p_amount          := v_lot.total_cost,
      p_ref_type        := 'reversal',
      p_ref_id          := v_lot.ledger_entry_id,
      p_ref_external_id := v_lot.external_id,
      p_description     := 'Reversal: lot ' || v_lot.external_id || ' voided'
                         || case when p_reason is null or p_reason = '' then ''
                                 else ' (' || p_reason || ')' end,
      p_idempotency_key := 'reversal-of-lot-' || p_lot_id::text,
      p_occurred_at     := now()
    );
  end if;

  update public.ingredient_lots
     set deleted_at = now(),
         notes = case
                   when p_reason is null or p_reason = '' then notes
                   else coalesce(notes || E'\n', '') || 'Voided: ' || p_reason
                 end
   where id = p_lot_id;

  return jsonb_build_object(
    'lot_id', p_lot_id,
    'voided_at', now(),
    'reversal_ledger_entry_id', v_reversal_id
  );
end; $$;

revoke all on function public.void_ingredient_lot(uuid, text) from public;
grant execute on function public.void_ingredient_lot(uuid, text) to authenticated;

create or replace function public.edit_ingredient_lot_cosmetic(
  p_lot_id        uuid,
  p_vendor        text default null,
  p_received_date date default null,
  p_notes         text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_lot record;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can edit lot details' using errcode = '42501';
  end if;

  select * into v_lot from public.ingredient_lots where id = p_lot_id and deleted_at is null;
  if not found then
    raise exception 'lot not found or already voided: %', p_lot_id using errcode = '23503';
  end if;

  if not public.user_can_use_account(v_lot.account_code) then
    raise exception 'you do not have access to the account this lot was paid from (%)', v_lot.account_code using errcode = '42501';
  end if;

  update public.ingredient_lots
     set vendor        = coalesce(p_vendor,        vendor),
         received_date = coalesce(p_received_date, received_date),
         notes         = coalesce(p_notes,         notes)
   where id = p_lot_id;
end; $$;

revoke all on function public.edit_ingredient_lot_cosmetic(uuid, text, date, text) from public;
grant execute on function public.edit_ingredient_lot_cosmetic(uuid, text, date, text) to authenticated;

alter table public.batches
  add column if not exists is_backfill boolean not null default false;

comment on column public.batches.is_backfill is
  'True = historical batch created during transition; no inventory was deducted. False = normal batch that consumed lots. Filter to is_backfill=false for accurate inventory/cost reporting.';

create or replace function public.create_batch(
  p_idempotency_key text, p_sku_code text, p_batch_date date default current_date,
  p_units_planned integer default 0, p_units_produced integer default 0, p_wastage integer default 0,
  p_ph numeric default null, p_brix numeric default null, p_qc_passed boolean default null,
  p_qc_notes text default null, p_staff_name text default null, p_notes text default null,
  p_inputs jsonb default '[]'::jsonb,
  p_is_backfill boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
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
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to create batches' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.batches (
    idempotency_key, sku_code, batch_date, units_planned, units_produced, wastage,
    ph, brix, qc_passed, qc_notes, staff_name, staff_user_id, notes, is_backfill
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes, p_staff_name, auth.uid(), p_notes, v_is_backfill
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
        coalesce(v_cost_est, 0),
        null,
        v_cost_est
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

  return v_batch_id;
end; $$;

revoke all on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb, boolean) from public;
grant execute on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb, boolean) to authenticated;
