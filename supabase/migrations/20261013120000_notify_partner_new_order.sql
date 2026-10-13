-- Notify the partner (Hanneh) whenever a new order is placed — manual, POS, or
-- Wix online sync. Flows through the existing notifications → dispatch pipeline
-- (in-app bell + device push + email). The dispatcher skips the creator, so an
-- order Hanneh creates herself won't ping her.
create or replace function public.notify_partner_on_new_order()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_who text;
begin
  v_who := coalesce(
    new.customer_name,
    (select name from public.partners where id = new.partner_id),
    new.event_name,
    'Walk-in'
  );
  insert into public.notifications (recipient_role, type, title, message, link, created_by_user_id)
  values ('partner', 'order_placed', 'New order placed',
          coalesce(new.channel::text, 'Order') || ' · ' || v_who,
          '/dashboard/orders/' || new.id::text,
          new.created_by_user_id);
  return new;
end; $function$;

drop trigger if exists notify_partner_on_new_order_trg on public.orders;
create trigger notify_partner_on_new_order_trg
  after insert on public.orders
  for each row execute function public.notify_partner_on_new_order();
