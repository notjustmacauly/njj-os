-- =================================================================
-- Allow one ingredient to be drawn from MULTIPLE lots in a single batch.
--
-- Real problem: making a batch of apple juice needs (say) 100kg of raw
-- apples, but the oldest lot only has 60kg. The system told the user to
-- "split into two inputs" — but the unique (batch_id, ingredient_code)
-- constraint forbade a second "apple" row, so it was impossible.
--
-- Fix: drop that constraint. The batch can now have multiple rows for the
-- same ingredient, each drawing from its own lot at its own cost. Every
-- RPC already consumes lots per-row (create_batch / create_draft_batch /
-- update_draft_batch / finalize_batch loop batch_inputs row-by-row and
-- decrement each lot), and COGS is summed across rows — so no function
-- changes are needed, only the constraint.
-- =================================================================

do $$
declare v_conname text;
begin
  -- Drop whatever unique constraint sits on (batch_id, ingredient_code),
  -- regardless of its auto-generated name.
  select c.conname into v_conname
    from pg_constraint c
   where c.conrelid = 'public.batch_inputs'::regclass
     and c.contype = 'u'
     and c.conkey = (
       select array_agg(a.attnum order by a.attnum)
         from pg_attribute a
        where a.attrelid = 'public.batch_inputs'::regclass
          and a.attname in ('batch_id', 'ingredient_code')
     );

  if v_conname is not null then
    execute format('alter table public.batch_inputs drop constraint %I', v_conname);
  end if;
end $$;

-- Keep lookups by batch fast (the old unique index is gone).
create index if not exists batch_inputs_batch_id_idx
  on public.batch_inputs (batch_id);

comment on table public.batch_inputs is
  'Ingredient consumption for a batch. One ingredient may appear on multiple rows when it is drawn from more than one lot (split across lots).';
