-- =================================================================
-- Billing — public shareable invoice link.
--
-- Each bill gets its own unguessable public_token. A partner can open
-- /i/<token> with no login to see the full branded invoice (same content
-- as the internal /bill/<id> page). Served by get_bill_invoice, a
-- SECURITY DEFINER function granted to anon so the bills table itself
-- stays locked down — only this one narrow, token-gated payload is exposed.
-- Mirrors the per-delivery receipt pattern (get_delivery_receipt).
-- =================================================================

-- 1) Stable, unguessable share token per bill.
alter table public.bills
  add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists bills_public_token_key on public.bills (public_token);

-- 2) Public invoice payload for one token. Returns null if the token doesn't
--    resolve to a live bill. Exposes only what belongs on the invoice.
create or replace function public.get_bill_invoice(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'bill', jsonb_build_object(
      'external_id',   b.external_id,
      'bill_date',     b.bill_date,
      'due_date',      b.due_date,
      'payment_terms', b.payment_terms,
      'status',        b.status,
      'subtotal',      b.subtotal,
      'delivery_fees', b.delivery_fees,
      'discount',      b.discount,
      'total',         b.total
    ),
    'partner', jsonb_build_object(
      'name',                     p.name,
      'registered_business_name', p.registered_business_name,
      'tin',                      p.tin,
      'address',                  p.address,
      'email',                    p.email
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_external_id',      o.external_id,
        'receivable_external_id', r.external_id,
        'order_date',             o.order_date,
        'delivery_date',          o.delivery_date,
        'amount',                 r.amount,
        'public_token',           o.public_token
      ) order by o.delivery_date nulls last, o.order_date, r.external_id)
      from public.bill_receivables br
      join public.receivables r on r.id = br.receivable_id
      left join public.orders o on o.id = r.order_id
      where br.bill_id = b.id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', a.description,
        'amount',      a.amount
      ) order by a.created_at)
      from public.bill_adjustments a
      where a.bill_id = b.id
    ), '[]'::jsonb)
  )
  from public.bills b
  left join public.partners p on p.id = b.partner_id
  where b.public_token = p_token and b.status <> 'cancelled';
$function$;

revoke all on function public.get_bill_invoice(uuid) from public;
grant execute on function public.get_bill_invoice(uuid) to anon, authenticated;
