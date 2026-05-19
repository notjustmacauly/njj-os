-- Void an ingredient lot. Owner-only because it reverses a ledger entry
-- (matches the rule that money-reversal actions are owner-gated).
-- Refuses if any batch_input references this lot, because the lot is part
-- of frozen historical cost data at that point.

create or replace function public.void_ingredient_lot(
  p_lot_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot          record;
  v_consumed_n   int;
  v_reversal_id  uuid;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can void ingredient lots' using errcode = '42501';
  end if;

  select * into v_lot from public.ingredient_lots where id = p_lot_id;
  if not found then
    raise exception 'lot not found: %', p_lot_id using errcode = '23503';
  end if;

  if v_lot.deleted_at is not null then
    return jsonb_build_object(
      'lot_id', p_lot_id, 'already_voided', true,
      'voided_at', v_lot.deleted_at
    );
  end if;

  select count(*) into v_consumed_n
  from public.batch_inputs
  where lot_id = p_lot_id;

  if v_consumed_n > 0 then
    raise exception
      'lot has been consumed by % batch input(s) — use a manual ledger correction instead of voiding',
      v_consumed_n
      using errcode = '22023';
  end if;

  if v_lot.ledger_entry_id is not null then
    v_reversal_id := public.ledger_reverse(
      v_lot.ledger_entry_id,
      coalesce(p_reason, 'lot voided: ' || v_lot.external_id)
    );
  end if;

  update public.ingredient_lots
     set deleted_at = now(),
         notes = case
                   when p_reason is null or p_reason = '' then notes
                   else coalesce(notes || E'\n', '') || 'Voided: ' || p_reason
                 end
   where id = p_lot_id;

  return jsonb_build_object(
    'lot_id', p_lot_id,
    'voided_at', now(),
    'reversal_ledger_entry_id', v_reversal_id
  );
end; $$;

revoke all on function public.void_ingredient_lot(uuid, text) from public;
grant execute on function public.void_ingredient_lot(uuid, text) to authenticated;
