-- Upsert a payee's account/contact details by name, WITHOUT touching notes
-- (save_payee resets every field, which would wipe notes when called from the
-- payment form). Used when a payment is submitted so the chosen payee's saved
-- account grows/updates and auto-fills next time.
create or replace function public.remember_payee_account(
  p_name           text,
  p_contact_number text default null,
  p_bank_name      text default null,
  p_account_number text default null,
  p_account_name   text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_norm text; v_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to save payee details' using errcode = '42501';
  end if;
  v_norm := lower(btrim(coalesce(p_name, '')));
  if v_norm = '' then return null; end if;

  select id into v_id from public.payees
   where normalized_name = v_norm and deleted_at is null limit 1;

  if v_id is null then
    insert into public.payees (
      name, contact_number, bank_name, account_number, account_name, created_by_user_id
    ) values (
      btrim(p_name),
      nullif(btrim(coalesce(p_contact_number, '')), ''),
      nullif(btrim(coalesce(p_bank_name, '')), ''),
      nullif(btrim(coalesce(p_account_number, '')), ''),
      nullif(btrim(coalesce(p_account_name, '')), ''),
      auth.uid()
    ) returning id into v_id;
  else
    update public.payees
       set contact_number = nullif(btrim(coalesce(p_contact_number, '')), ''),
           bank_name      = nullif(btrim(coalesce(p_bank_name, '')), ''),
           account_number = nullif(btrim(coalesce(p_account_number, '')), ''),
           account_name   = nullif(btrim(coalesce(p_account_name, '')), ''),
           is_active      = true,
           updated_at     = now()
     where id = v_id;
  end if;
  return v_id;
end; $function$;

grant execute on function public.remember_payee_account(text, text, text, text, text) to authenticated;
