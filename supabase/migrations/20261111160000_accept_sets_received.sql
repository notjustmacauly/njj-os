-- Accepting a delivery also moves the order to fulfillment_status 'Received'
-- (unless cancelled). One-time, like the acceptance itself.
create or replace function public.accept_delivery(p_token uuid, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_name text := nullif(trim(coalesce(p_name,'')), '');
begin
  if v_name is null then raise exception 'name is required' using errcode='22023'; end if;
  select id, received_by_name, received_at, fulfillment_status into v
    from public.orders where public_token = p_token and deleted_at is null;
  if not found then raise exception 'delivery not found' using errcode='23503'; end if;
  if v.received_at is null then
    update public.orders set
        received_by_name = v_name,
        received_at = now(),
        fulfillment_status = case when fulfillment_status = 'Cancelled'
                                  then fulfillment_status
                                  else 'Received'::public.fulfillment_status end,
        updated_at = now()
     where id = v.id
     returning received_by_name, received_at into v.received_by_name, v.received_at;
  end if;
  return jsonb_build_object('received_by_name', v.received_by_name, 'received_at', v.received_at);
end; $function$;
revoke all on function public.accept_delivery(uuid,text) from public;
grant execute on function public.accept_delivery(uuid,text) to anon, authenticated;
