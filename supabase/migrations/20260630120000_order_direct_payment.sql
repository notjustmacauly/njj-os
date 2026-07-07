-- =================================================================
-- Faster order payment: collect directly on the order instead of the
-- Finance → Receivables → (Bill) → Mark paid detour.
--
-- Context (unchanged):
--   * Retail/Online/Event orders never create a receivable — they already
--     have mark_order_paid() (ledger 'in' + payment_status='Paid').
--   * B2B orders auto-create a pending receivable on delivery and are
--     normally billed. That stays the default.
--
-- This adds:
--   1. partners.pays_on_delivery — opt-in flag for partners who pay cash/QR
--      on the spot. Their delivered orders can be settled in one click,
--      WITHOUT changing the receivables workflow for everyone else.
--   2. mark_order_paid_cod() — settles a delivered B2B-COD order's pending
--      receivable directly (same effect as Finance's mark_receivable_paid_cash).
--   3. mark_orders_paid_bulk() — mark many orders paid to one account at once.
-- =================================================================

-- 1) Partner COD opt-in --------------------------------------------
alter table public.partners
  add column if not exists pays_on_delivery boolean not null default false;

comment on column public.partners.pays_on_delivery is
  'When true, this partner pays on delivery (cash/QR). Their delivered orders can be marked paid directly from the order, settling the auto-created receivable — bypassing the bill step. Default false = normal invoice/billing flow.';

-- 2) Settle a delivered B2B-COD order's receivable directly --------
create or replace function public.mark_order_paid_cod(
  p_order_id     uuid,
  p_account_code text,
  p_amount       numeric default null,
  p_paid_date    date    default current_date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order   record;
  v_partner record;
  v_recv    record;
  v_amount  numeric;
  v_ledger  uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_account_code is null or length(trim(p_account_code)) = 0 then
    raise exception 'account_code is required' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'order not found: %', p_order_id using errcode = '23503';
  end if;
  if v_order.payment_status = 'Paid' then
    return null; -- idempotent
  end if;
  if v_order.channel <> 'B2B' then
    raise exception 'use mark_order_paid for non-B2B orders' using errcode = '22023';
  end if;

  select * into v_partner from public.partners where id = v_order.partner_id;
  if not found or not coalesce(v_partner.pays_on_delivery, false) then
    raise exception 'this partner is on invoice terms — bill the order instead (enable "pays on delivery" on the partner to allow direct payment)'
      using errcode = '22023';
  end if;

  -- The receivable is created when a B2B order is delivered.
  select r.* into v_recv
    from public.receivables r
   where r.order_id = p_order_id and r.deleted_at is null;
  if not found then
    raise exception 'deliver the order first — no receivable exists yet' using errcode = '22023';
  end if;
  if v_recv.status <> 'pending' then
    raise exception 'receivable is already % — pay/track it via Finance', v_recv.status using errcode = '22023';
  end if;

  v_amount := coalesce(p_amount, v_recv.amount, v_order.total);
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  -- Same effect (and idempotency key) as mark_receivable_paid_cash, so the
  -- two paths can never double-post for the same receivable.
  v_ledger := public.ledger_apply(
    p_account_code     := p_account_code,
    p_direction        := 'in',
    p_amount           := v_amount,
    p_ref_type         := 'receivable',
    p_ref_id           := v_recv.id,
    p_ref_external_id  := v_recv.external_id,
    p_description      := 'Receivable ' || coalesce(v_recv.external_id, v_recv.id::text)
                          || ' paid on delivery (order ' || coalesce(v_order.external_id, '') || ')',
    p_idempotency_key  := 'recv-cash-' || v_recv.id::text,
    p_occurred_at      := p_paid_date::timestamptz
  );

  update public.receivables
     set status            = 'paid',
         paid_amount       = v_amount,
         paid_date         = p_paid_date,
         paid_account_code = p_account_code,
         ledger_entry_id   = v_ledger,
         updated_at        = now()
   where id = v_recv.id;

  update public.orders
     set payment_status = 'Paid', updated_at = now()
   where id = p_order_id;

  return v_ledger;
end; $function$;

revoke all on function public.mark_order_paid_cod(uuid, text, numeric, date) from public;
grant execute on function public.mark_order_paid_cod(uuid, text, numeric, date) to authenticated;

-- 3) Bulk mark paid (one account, many orders) ---------------------
-- Routes each order to the right single-order RPC and skips anything that
-- can't be settled this way (already paid, B2B without COD/receivable, etc.),
-- so a bad row never aborts the batch. Returns how many were paid vs skipped.
create or replace function public.mark_orders_paid_bulk(
  p_order_ids    uuid[],
  p_account_code text,
  p_paid_date    date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id      uuid;
  v_order   record;
  v_paid    int := 0;
  v_skipped int := 0;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if p_account_code is null or length(trim(p_account_code)) = 0 then
    raise exception 'account_code is required' using errcode = '22023';
  end if;

  foreach v_id in array coalesce(p_order_ids, '{}'::uuid[])
  loop
    begin
      select * into v_order from public.orders where id = v_id and deleted_at is null;
      if not found or v_order.payment_status = 'Paid' then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_order.channel = 'B2B' then
        perform public.mark_order_paid_cod(v_id, p_account_code, null, p_paid_date);
      else
        perform public.mark_order_paid(v_id, p_account_code, null, p_paid_date);
      end if;
      v_paid := v_paid + 1;
    exception when others then
      -- one bad order shouldn't kill the batch
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object('paid', v_paid, 'skipped', v_skipped);
end; $function$;

revoke all on function public.mark_orders_paid_bulk(uuid[], text, date) from public;
grant execute on function public.mark_orders_paid_bulk(uuid[], text, date) to authenticated;
