-- Digital proof-of-delivery: the receiver opens the receipt (via the verify QR),
-- types their name, and confirms receipt. We stamp a server-side timestamp.
-- One-time: once accepted it can't be overwritten (tamper-resistant evidence).
alter table public.orders
  add column if not exists received_by_name text,
  add column if not exists received_at timestamptz;

-- Anon-callable (the receipt token is the capability — whoever holds the printed
-- slip / QR can accept). Sets the acceptance once; returns the recorded values.
create or replace function public.accept_delivery(p_token uuid, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_name text := nullif(trim(coalesce(p_name,'')), '');
begin
  if v_name is null then raise exception 'name is required' using errcode='22023'; end if;
  select id, received_by_name, received_at into v
    from public.orders where public_token = p_token and deleted_at is null;
  if not found then raise exception 'delivery not found' using errcode='23503'; end if;
  if v.received_at is null then
    update public.orders set received_by_name = v_name, received_at = now(), updated_at = now()
     where id = v.id
     returning received_by_name, received_at into v.received_by_name, v.received_at;
  end if;
  return jsonb_build_object('received_by_name', v.received_by_name, 'received_at', v.received_at);
end; $function$;
revoke all on function public.accept_delivery(uuid,text) from public;
grant execute on function public.accept_delivery(uuid,text) to anon, authenticated;

-- Receipt payload carries the acceptance so the page can show it.
create or replace function public.get_delivery_receipt(p_token uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'external_id',        o.external_id,
      'order_date',         o.order_date,
      'delivery_date',      o.delivery_date,
      'channel',            o.channel,
      'payment_status',     o.payment_status,
      'fulfillment_status', o.fulfillment_status,
      'received_by_name',   o.received_by_name,
      'received_at',        o.received_at,
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
