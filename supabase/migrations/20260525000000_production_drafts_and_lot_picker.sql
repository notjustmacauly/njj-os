-- =================================================================
-- Production drafts + multi-lot picker.
--
-- Workflow change:
--   Today  — create_batch() does everything in one shot (lot deduction
--            + COGS posting + units_produced). Manager/Owner/Partner all
--            call it directly.
--   New    — Manager can ONLY create drafts (no ledger impact). Owner /
--            Partner can finalize a draft (which is when lots are
--            deducted and COGS is posted). Owner/Partner retain the
--            old one-shot create_batch path for backfills.
--
-- Adds:
--   - batch_status enum ('draft' | 'finalized' | 'voided')
--   - batches.status column, default 'finalized' (existing rows backfilled)
--   - batches.finalized_at, finalized_by_user_id
--   - create_draft_batch / update_draft_batch / finalize_batch / discard_draft_batch
--   - tightens create_batch (legacy one-shot) to owner/partner only
--   - inventory_summary view updated to ignore non-finalized batches
--
-- NOT included (deferred):
--   - ingredient_lot_reservations table. Reservations would help when
--     two people are drafting at the same time, but with a 3-person team
--     and sequential production this is overkill. We rely on "first to
--     finalize wins; second finalize fails if lot is empty". Document
--     this as a known limitation and add reservations in a Phase 2 if it
--     bites us.
--
-- Spec: docs/specs/PRODUCTION_DRAFTS_AND_LOT_PICKER.md
-- DO NOT APPLY ahead of the frontend changes. CC will apply this
-- migration alongside the matching UI in the same deploy.
-- =================================================================

-- ---------- 1) batch_status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'batch_status') then
    create type public.batch_status as enum ('draft', 'finalized', 'voided');
  end if;
end$$;

-- ---------- 2) batches columns
alter table public.batches
  add column if not exists status              public.batch_status not null default 'finalized',
  add column if not exists finalized_at        timestamptz,
  add column if not exists finalized_by_user_id uuid references auth.users(id);

-- Existing rows: every batch in the DB today represents finished, ledger-posted
-- production. Backfill them all to 'finalized'. The DEFAULT already does this
-- for the column add; this UPDATE is belt + suspenders.
update public.batches
   set status        = 'finalized',
       finalized_at  = coalesce(finalized_at, created_at)
 where status is null
    or (status = 'finalized' and finalized_at is null);

comment on column public.batches.status is
  '''draft'' = inputs proposed, no ledger impact yet. ''finalized'' = lots deducted, COGS posted. ''voided'' = reversed.';
comment on column public.batches.finalized_at is
  'When the batch transitioned from draft to finalized (or created directly via legacy create_batch).';

-- ---------- 3) Tighten legacy create_batch to owner/partner only
-- Manager loses direct access; they must now go through create_draft_batch +
-- have Owner/Partner finalize. Owner/Partner can still call create_batch
-- directly (used by backfill flow + any quick one-shot adds).
create or replace function public.create_batch(
  p_idempotency_key text,
  p_sku_code        text,
  p_batch_date      date    default current_date,
  p_units_planned   integer default 0,
  p_units_produced  integer default 0,
  p_wastage         integer default 0,
  p_ph              numeric default null,
  p_brix            numeric default null,
  p_qc_passed       boolean default null,
  p_qc_notes        text    default null,
  p_staff_name      text    default null,
  p_notes           text    default null,
  p_inputs          jsonb   default '[]'::jsonb,
  p_is_backfill     boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  -- TIGHTENED: was owner/partner/manager; now owner/partner only.
  -- Manager must use create_draft_batch then ask owner/partner to finalize.
  if current_user_role() not in ('owner','partner') then
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
    status, finalized_at, finalized_by_user_id
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes, p_staff_name, auth.uid(), p_notes, v_is_backfill,
    'finalized', now(), auth.uid()
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

  return v_batch_id;
end; $$;

-- ---------- 4) create_draft_batch
-- Manager / Owner / Partner can create a draft. No lot deduction, no COGS,
-- no units_produced (yet). Inputs are stored as proposed ingredient lines
-- with optional explicit lot_id pre-picked (the UI uses the lot picker to
-- let the operator override FIFO).
create or replace function public.create_draft_batch(
  p_idempotency_key text,
  p_sku_code        text,
  p_batch_date      date    default current_date,
  p_units_planned   integer default 0,
  p_staff_name      text    default null,
  p_notes           text    default null,
  p_inputs          jsonb   default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id    uuid;
  v_existing_id uuid;
  v_input       jsonb;
  v_code        text;
  v_qty         numeric;
  v_unit        text;
  v_cost_est    numeric;
  v_lot_id      uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to draft batches' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.batches (
    idempotency_key, sku_code, batch_date, units_planned, units_produced, wastage,
    staff_name, staff_user_id, notes, status
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), 0, 0,
    p_staff_name, auth.uid(), p_notes, 'draft'
  ) returning id into v_batch_id;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    v_code := v_input->>'ingredient_code';
    v_qty  := (v_input->>'qty_used')::numeric;
    v_unit := v_input->>'unit';
    v_cost_est := nullif(v_input->>'cost_per_unit', '')::numeric;
    v_lot_id := nullif(v_input->>'lot_id', '')::uuid;

    if v_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid draft input: %', v_input using errcode = '22023';
    end if;

    -- Light validation: if a lot_id is provided, make sure the ingredient
    -- code matches the lot's ingredient. Don't validate qty here — that's
    -- a finalize-time check, since stock can change between draft and finalize.
    if v_lot_id is not null then
      perform 1 from public.ingredient_lots
       where id = v_lot_id and ingredient_code = v_code and deleted_at is null;
      if not found then
        raise exception 'proposed lot % is invalid for ingredient %', v_lot_id, v_code
          using errcode = '22023';
      end if;
    end if;

    -- Drafts store inputs in batch_inputs with cost_per_unit_at_use NULL.
    -- At finalize time we'll re-resolve lot + cost.
    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit,
      lot_id, cost_per_unit_at_use
    ) values (
      v_batch_id, v_code, v_qty, coalesce(v_unit, ''),
      coalesce(v_cost_est, 0), v_lot_id, null
    );
  end loop;

  return v_batch_id;
end; $$;

revoke all on function public.create_draft_batch(text, text, date, integer, text, text, jsonb) from public;
grant execute on function public.create_draft_batch(text, text, date, integer, text, text, jsonb) to authenticated;

-- ---------- 5) update_draft_batch
-- Replaces the draft's inputs and editable metadata. Only the draft creator
-- (own draft) or owner/partner can edit. Drafts only.
create or replace function public.update_draft_batch(
  p_batch_id      uuid,
  p_sku_code      text,
  p_batch_date    date,
  p_units_planned integer,
  p_staff_name    text,
  p_notes         text,
  p_inputs        jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        app_role;
  v_creator     uuid;
  v_status      public.batch_status;
  v_input       jsonb;
  v_code        text;
  v_qty         numeric;
  v_unit        text;
  v_cost_est    numeric;
  v_lot_id      uuid;
begin
  v_role := current_user_role();
  if v_role is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select status, staff_user_id into v_status, v_creator
    from public.batches where id = p_batch_id and deleted_at is null;
  if not found then
    raise exception 'batch not found' using errcode = '23503';
  end if;
  if v_status <> 'draft' then
    raise exception 'can only edit drafts (status = %)', v_status using errcode = '22023';
  end if;

  -- Manager can edit only their own drafts. Owner / Partner can edit any.
  if v_role = 'manager' and v_creator is distinct from auth.uid() then
    raise exception 'managers can only edit their own drafts' using errcode = '42501';
  end if;
  if v_role not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to edit drafts' using errcode = '42501';
  end if;

  update public.batches
     set sku_code      = p_sku_code,
         batch_date    = p_batch_date,
         units_planned = coalesce(p_units_planned, units_planned),
         staff_name    = p_staff_name,
         notes         = p_notes,
         updated_at    = now()
   where id = p_batch_id;

  -- Replace inputs wholesale. Simpler than diffing.
  delete from public.batch_inputs where batch_id = p_batch_id;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    v_code := v_input->>'ingredient_code';
    v_qty  := (v_input->>'qty_used')::numeric;
    v_unit := v_input->>'unit';
    v_cost_est := nullif(v_input->>'cost_per_unit', '')::numeric;
    v_lot_id := nullif(v_input->>'lot_id', '')::uuid;

    if v_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid draft input: %', v_input using errcode = '22023';
    end if;

    if v_lot_id is not null then
      perform 1 from public.ingredient_lots
       where id = v_lot_id and ingredient_code = v_code and deleted_at is null;
      if not found then
        raise exception 'proposed lot % is invalid for ingredient %', v_lot_id, v_code
          using errcode = '22023';
      end if;
    end if;

    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit,
      lot_id, cost_per_unit_at_use
    ) values (
      p_batch_id, v_code, v_qty, coalesce(v_unit, ''),
      coalesce(v_cost_est, 0), v_lot_id, null
    );
  end loop;
end; $$;

revoke all on function public.update_draft_batch(uuid, text, date, integer, text, text, jsonb) from public;
grant execute on function public.update_draft_batch(uuid, text, date, integer, text, text, jsonb) to authenticated;

-- ---------- 6) finalize_batch
-- Owner / Partner only. Reads the draft, deducts lots (using each input's
-- pre-picked lot_id; falls back to FIFO if null), auto-deducts cans, and
-- transitions to status='finalized'. This is where COGS hits the ledger.
create or replace function public.finalize_batch(
  p_batch_id        uuid,
  p_units_produced  integer,
  p_wastage         integer default 0,
  p_ph              numeric default null,
  p_brix            numeric default null,
  p_qc_passed       boolean default null,
  p_qc_notes        text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch        record;
  v_input        record;
  v_lot          record;
  v_lot_id       uuid;
  v_explicit_lot boolean;
  v_can_code     text;
  v_can_already  boolean := false;
begin
  if current_user_role() not in ('owner','partner') then
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

  -- Iterate the proposed inputs and resolve each to a real lot deduction.
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

  -- Can auto-deduct if SKU has a can_ingredient and we didn't already
  -- include it explicitly in the inputs.
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

  -- Promote the batch.
  update public.batches
     set status               = 'finalized',
         units_produced       = p_units_produced,
         wastage              = coalesce(p_wastage, 0),
         ph                   = p_ph,
         brix                 = p_brix,
         qc_passed            = p_qc_passed,
         qc_notes             = p_qc_notes,
         finalized_at         = now(),
         finalized_by_user_id = auth.uid(),
         updated_at           = now()
   where id = p_batch_id;

  -- Recompute COGS from the now-final batch_inputs.
  perform public.recompute_batch_cogs(p_batch_id);
end; $$;

revoke all on function public.finalize_batch(uuid, integer, integer, numeric, numeric, boolean, text) from public;
grant execute on function public.finalize_batch(uuid, integer, integer, numeric, numeric, boolean, text) to authenticated;

-- ---------- 7) discard_draft_batch
-- Soft-delete a draft. Manager can only discard their own draft.
-- Owner / Partner can discard any draft.
create or replace function public.discard_draft_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    app_role;
  v_creator uuid;
  v_status  public.batch_status;
begin
  v_role := current_user_role();
  if v_role is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select status, staff_user_id into v_status, v_creator
    from public.batches where id = p_batch_id and deleted_at is null;
  if not found then
    raise exception 'batch not found' using errcode = '23503';
  end if;
  if v_status <> 'draft' then
    raise exception 'can only discard drafts (status = %)', v_status using errcode = '22023';
  end if;

  if v_role = 'manager' and v_creator is distinct from auth.uid() then
    raise exception 'managers can only discard their own drafts' using errcode = '42501';
  end if;
  if v_role not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to discard drafts' using errcode = '42501';
  end if;

  update public.batches
     set deleted_at = now(),
         updated_at = now()
   where id = p_batch_id;

  -- batch_inputs stay attached (audit trail). They never hit the ledger,
  -- so no cleanup needed.
end; $$;

revoke all on function public.discard_draft_batch(uuid) from public;
grant execute on function public.discard_draft_batch(uuid) to authenticated;

-- ---------- 8) inventory_summary view: ignore non-finalized batches
-- Drafts have units_produced=0 anyway, so they'd appear with remaining=0,
-- but filtering them out keeps the inventory page clean.
create or replace view public.inventory_summary as
 with order_use as (
   select order_items.batch_id, sum(order_items.qty) as qty
     from public.order_items
    where order_items.batch_id is not null
    group by order_items.batch_id
 ), pos_use as (
   select pos_transaction_items.batch_id, sum(pos_transaction_items.qty) as qty
     from public.pos_transaction_items
    where pos_transaction_items.batch_id is not null
      and pos_transaction_items.item_type = 'juice'::pos_item_type
    group by pos_transaction_items.batch_id
 ), deduction_use as (
   select deduction_items.batch_id, sum(deduction_items.qty) as qty
     from public.deduction_items
    where deduction_items.batch_id is not null
    group by deduction_items.batch_id
 )
 select b.id as batch_id,
        b.external_id as batch_external_id,
        b.batch_date,
        b.sku_code,
        b.units_produced,
        coalesce(o.qty, 0::bigint) as sold_via_orders,
        coalesce(p.qty, 0::bigint) as sold_via_pos,
        coalesce(d.qty, 0::bigint) as deducted,
        greatest(b.units_produced - coalesce(o.qty, 0::bigint)
                                   - coalesce(p.qty, 0::bigint)
                                   - coalesce(d.qty, 0::bigint), 0::bigint) as remaining,
        b.units_produced - coalesce(o.qty, 0::bigint)
                         - coalesce(p.qty, 0::bigint)
                         - coalesce(d.qty, 0::bigint) as remaining_signed,
        b.cogs_total,
        b.qc_passed,
        b.deleted_at
   from public.batches b
   left join order_use     o on o.batch_id = b.id
   left join pos_use       p on p.batch_id = b.id
   left join deduction_use d on d.batch_id = b.id
  where b.deleted_at is null
    and b.status = 'finalized';
