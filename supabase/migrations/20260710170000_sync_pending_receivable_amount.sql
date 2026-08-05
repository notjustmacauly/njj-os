-- Keep a pending receivable's amount in step with its order.
--
-- Receivables are created at delivery with the order total at that instant.
-- Editing the order afterwards (e.g. adding a delivery fee) updated the order
-- but left the receivable stale. This trigger syncs the amount whenever the
-- order total changes — but only while the receivable is still 'pending'. Once
-- it's 'billed' or 'paid' the amount is locked into a bill/payment and must be
-- corrected through those flows, not silently.
create or replace function public.sync_pending_receivable_amount()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.total is distinct from old.total then
    update public.receivables
       set amount = new.total, updated_at = now()
     where order_id = new.id
       and deleted_at is null
       and status = 'pending';
  end if;
  return new;
end; $function$;

drop trigger if exists orders_sync_receivable_amount on public.orders;
create trigger orders_sync_receivable_amount
  after update on public.orders
  for each row execute function public.sync_pending_receivable_amount();
