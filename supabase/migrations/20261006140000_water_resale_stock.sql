-- Track bottled water (and future resale goods) as stock:
--  * received into inventory with cost (existing receive_supplies flow),
--  * auto-deducted when sold through POS,
--  * manually adjustable for off-POS market days / corrections.
-- Deduction mirrors production consumption: it reduces ingredient_lots
-- qty_remaining FIFO, driving the latest lot negative on oversell (allow+flag).

-- Seed the water stock item.
insert into public.ingredients (code, name, type, unit, cost_per_unit, is_active)
values ('WATER_BOTTLE', 'Bottled Water', 'resale', 'unit', 0, true)
on conflict (code) do nothing;

-- Core: apply a signed change to an item's on-hand.
--   p_change < 0  → sell/consume: reduce qty_remaining FIFO (oldest lots first);
--                   any shortfall is driven onto the most recent lot (may go negative).
--   p_change > 0  → return/correction: add back onto the most recent lot.
-- No ledger impact — the cash was booked at purchase (receive). If an item has no
-- lots yet, nothing happens (receive stock first).
create or replace function public.apply_resale_stock_change(p_code text, p_change numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_need numeric; v_take numeric; v_lot record; v_recent uuid;
begin
  if p_change is null or p_change = 0 then return; end if;

  if p_change < 0 then
    v_need := -p_change;
    for v_lot in
      select id, qty_remaining from public.ingredient_lots
      where ingredient_code = p_code and deleted_at is null and qty_remaining > 0
      order by received_date asc, created_at asc
    loop
      exit when v_need <= 0;
      v_take := least(v_need, v_lot.qty_remaining);
      update public.ingredient_lots set qty_remaining = qty_remaining - v_take, updated_at = now()
       where id = v_lot.id;
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      select id into v_recent from public.ingredient_lots
       where ingredient_code = p_code and deleted_at is null
       order by received_date desc, created_at desc limit 1;
      if v_recent is not null then
        update public.ingredient_lots set qty_remaining = qty_remaining - v_need, updated_at = now()
         where id = v_recent;
      end if;
    end if;
  else
    select id into v_recent from public.ingredient_lots
     where ingredient_code = p_code and deleted_at is null
     order by received_date desc, created_at desc limit 1;
    if v_recent is not null then
      update public.ingredient_lots set qty_remaining = qty_remaining + p_change, updated_at = now()
       where id = v_recent;
    end if;
  end if;
end; $$;
revoke all on function public.apply_resale_stock_change(text,numeric) from public, anon;

-- POS keeps water stock in lock-step with each transaction's water count.
-- Fires on insert + on the recompute UPDATE that sets water_qty; reverses on void.
-- Never raises — a stock hiccup must never block a sale.
create or replace function public.pos_sync_water_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old int; v_new int; v_delta int;
begin
  v_old := case when tg_op = 'INSERT' then 0 else coalesce(old.water_qty, 0) end;
  if tg_op <> 'INSERT' and old.deleted_at is not null then v_old := 0; end if;
  v_new := coalesce(new.water_qty, 0);
  if new.deleted_at is not null then v_new := 0; end if;
  v_delta := v_new - v_old;            -- units newly sold (positive) or reversed (negative)
  if v_delta <> 0 then
    perform public.apply_resale_stock_change('WATER_BOTTLE', -v_delta);
  end if;
  return null;
exception when others then
  return null;
end; $$;

drop trigger if exists pos_sync_water_stock_trg on public.pos_transactions;
create trigger pos_sync_water_stock_trg
  after insert or update on public.pos_transactions
  for each row execute function public.pos_sync_water_stock();

-- Manual stock adjustment (off-POS market days, spoilage, counts).
create or replace function public.adjust_resale_stock(p_code text, p_delta numeric, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() not in ('owner','partner','manager') then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'enter a non-zero amount' using errcode = '22023'; end if;
  if not exists (select 1 from public.ingredients where code = p_code and deleted_at is null and type = 'resale') then
    raise exception 'not a resale item' using errcode = '23503'; end if;
  if not exists (select 1 from public.ingredient_lots where ingredient_code = p_code and deleted_at is null) then
    raise exception 'no stock lots yet — log a receipt first' using errcode = '22023'; end if;
  perform public.apply_resale_stock_change(p_code, p_delta);
end; $$;
revoke all on function public.adjust_resale_stock(text,numeric,text) from public, anon;
grant execute on function public.adjust_resale_stock(text,numeric,text) to authenticated, service_role;
