-- Owner-managed allow-list for the Telegram expense bot. Lets the owner add /
-- rename / activate / deactivate teammates from the app instead of running SQL.
create or replace function public.set_telegram_allowed_user(
  p_telegram_user_id bigint,
  p_display_name     text,
  p_is_active        boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_user_role() <> 'owner' then
    raise exception 'only the owner can manage Telegram bot access' using errcode = '42501';
  end if;
  if p_telegram_user_id is null then
    raise exception 'telegram_user_id is required' using errcode = '22023';
  end if;
  insert into public.telegram_allowed_users (telegram_user_id, display_name, is_active)
  values (p_telegram_user_id, nullif(trim(p_display_name), ''), coalesce(p_is_active, true))
  on conflict (telegram_user_id) do update
    set display_name = excluded.display_name,
        is_active    = excluded.is_active;
end; $function$;

revoke all on function public.set_telegram_allowed_user(bigint, text, boolean) from public;
grant execute on function public.set_telegram_allowed_user(bigint, text, boolean) to authenticated;
