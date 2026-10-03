-- Record whether the checkout confirmation email went out, so failures show
-- up in Website studio instead of being silently swallowed.
alter table public.web_checkouts
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error   text;

-- Called by the public checkout route (anon) right after sending. Token-gated
-- and limited to the two email-status columns.
create or replace function public.web_mark_checkout_email(p_token uuid, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.web_checkouts
     set email_sent_at = case when p_error is null then now() else email_sent_at end,
         email_error   = left(p_error, 500),
         updated_at    = now()
   where public_token = p_token
$$;

revoke all on function public.web_mark_checkout_email(uuid, text) from public;
grant execute on function public.web_mark_checkout_email(uuid, text) to anon, authenticated;
