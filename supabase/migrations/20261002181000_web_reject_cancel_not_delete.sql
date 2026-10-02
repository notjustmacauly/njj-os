-- Reject must not soft-delete: cascade_order_soft_delete refuses to delete any
-- order with ledger entries (even ones netting to zero). Rejected web orders
-- are kept as Cancelled (payment + fulfilment) — visible in Orders as a record,
-- excluded from stock holds, and their holding-account entries net to ₱0.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.web_review_checkout(uuid,text,text,text)'::regprocedure);
  v_def := replace(v_def,
    'fulfillment_status = ''Cancelled'', deleted_at = now(),',
    'fulfillment_status = ''Cancelled'',');
  execute v_def;
end $$;
