-- Delivery receipt returns payment + fulfillment status so the digital version
-- (opened via the verify QR on the printed slip) shows if the order is paid.
create or replace function public.get_delivery_receipt(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'external_id',        o.external_id,
      'order_date',         o.order_date,
      'delivery_date',      o.delivery_date,
      'channel',            o.channel,
      'payment_status',     o.payment_status,
      'fulfillment_status', o.fulfillment_status,
      'delivery_fee',       o.delivery_fee,
      'discount',           o.discount,
      'subtotal',           o.subtotal,
      'total',              o.total
    ),
    'partner', jsonb_build_object(
      'name',                     p.name,
      'registered_business_name', p.registered_business_name
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku_code',   oi.sku_code,
        'sku_name',   coalesce(s.name, oi.sku_code),
        'qty',        oi.qty,
        'unit_price', oi.unit_price,
        'subtotal',   oi.subtotal
      ) order by oi.created_at)
      from public.order_items oi
      left join public.skus s on s.code = oi.sku_code
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  left join public.partners p on p.id = o.partner_id
  where o.public_token = p_token and o.deleted_at is null;
$function$;
revoke all on function public.get_delivery_receipt(uuid) from public;
grant execute on function public.get_delivery_receipt(uuid) to anon, authenticated;
