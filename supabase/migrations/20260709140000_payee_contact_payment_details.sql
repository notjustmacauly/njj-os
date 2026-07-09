-- =================================================================
-- Payees: store contact + payment details so they're saved once and
-- reused (bank / account number / account name / contact number).
-- Adds a save_payee() RPC for create+edit with full details; the
-- name-only upsert_payee() (auto-grow) stays for transaction forms.
-- =================================================================

alter table public.payees
  add column if not exists contact_number text,
  add column if not exists bank_name      text,
  add column if not exists account_number text,
  add column if not exists account_name   text;

create or replace function public.save_payee(
  p_id             uuid  default null,
  p_name           text  default null,
  p_contact_number text  default null,
  p_bank_name      text  default null,
  p_account_number text  default null,
  p_account_name   text  default null,
  p_notes          text  default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_norm text; v_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to edit payees' using errcode = '42501';
  end if;
  v_norm := lower(btrim(coalesce(p_name, '')));
  if v_norm = '' then
    raise exception 'payee name is required' using errcode = '22023';
  end if;

  if p_id is null then
    -- create (or fill in details on an existing same-named payee)
    select id into v_id from public.payees
     where normalized_name = v_norm and deleted_at is null limit 1;
    if v_id is not null then
      update public.payees
         set name           = btrim(p_name),
             contact_number = nullif(btrim(coalesce(p_contact_number, '')), ''),
             bank_name      = nullif(btrim(coalesce(p_bank_name, '')), ''),
             account_number = nullif(btrim(coalesce(p_account_number, '')), ''),
             account_name   = nullif(btrim(coalesce(p_account_name, '')), ''),
             notes          = nullif(btrim(coalesce(p_notes, '')), ''),
             is_active      = true,
             updated_at     = now()
       where id = v_id;
      return v_id;
    end if;

    insert into public.payees (
      name, contact_number, bank_name, account_number, account_name, notes, created_by_user_id
    ) values (
      btrim(p_name),
      nullif(btrim(coalesce(p_contact_number, '')), ''),
      nullif(btrim(coalesce(p_bank_name, '')), ''),
      nullif(btrim(coalesce(p_account_number, '')), ''),
      nullif(btrim(coalesce(p_account_name, '')), ''),
      nullif(btrim(coalesce(p_notes, '')), ''),
      auth.uid()
    ) returning id into v_id;
    return v_id;
  end if;

  -- edit existing
  if exists (
    select 1 from public.payees
     where normalized_name = v_norm and deleted_at is null and id <> p_id
  ) then
    raise exception 'another payee already uses that name' using errcode = '23505';
  end if;

  update public.payees
     set name           = btrim(p_name),
         contact_number = nullif(btrim(coalesce(p_contact_number, '')), ''),
         bank_name      = nullif(btrim(coalesce(p_bank_name, '')), ''),
         account_number = nullif(btrim(coalesce(p_account_number, '')), ''),
         account_name   = nullif(btrim(coalesce(p_account_name, '')), ''),
         notes          = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_at     = now()
   where id = p_id and deleted_at is null;
  return p_id;
end; $function$;

revoke all on function public.save_payee(uuid, text, text, text, text, text, text) from public;
grant execute on function public.save_payee(uuid, text, text, text, text, text, text) to authenticated;
