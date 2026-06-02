-- Fire the delivery dispatcher whenever a notification row is inserted.
-- Uses pg_net to POST the new notification's id to the dispatch-notification
-- Edge Function, which then sends push + email per each recipient's prefs.
--
-- Auth between the DB and the function uses a shared secret stored in Supabase
-- Vault (name 'notification_webhook_secret'). Nothing sensitive lives in source
-- or schema. Secret values are inserted post-deploy via vault.create_secret().

create extension if not exists pg_net;

-- Service-role-only reader for the secrets the Edge Function needs. SECURITY
-- DEFINER so it can read the (otherwise inaccessible) vault; execute is granted
-- only to service_role, so the anon/auth API can never call it.
create or replace function public.get_notification_secrets()
returns jsonb
language sql
security definer
set search_path to 'public', 'vault'
as $function$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in (
    'notification_webhook_secret',
    'vapid_public_key',
    'vapid_private_key',
    'vapid_subject',
    'gmail_user',
    'gmail_app_password'
  );
$function$;

revoke all on function public.get_notification_secrets() from public, anon, authenticated;
grant execute on function public.get_notification_secrets() to service_role;

create or replace function public.dispatch_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_url    text := 'https://hatqqguxdezdhlocffqc.supabase.co/functions/v1/dispatch-notification';
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'notification_webhook_secret'
    limit 1;

  -- No secret configured yet → skip delivery (in-app notification still works).
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object('notification_id', new.id)
  );

  return new;
exception when others then
  -- Never let a delivery hiccup roll back the notification insert.
  return new;
end;
$function$;

drop trigger if exists trg_dispatch_notification on public.notifications;
create trigger trg_dispatch_notification
  after insert on public.notifications
  for each row execute function public.dispatch_notification();
