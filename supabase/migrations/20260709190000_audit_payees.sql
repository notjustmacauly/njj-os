-- Payees was added after the original audit_trigger rollout, so it never got
-- an audit trigger. Attach one so payee create/edit/delete is recorded in
-- audit_log like every other core table.
drop trigger if exists payees_audit on public.payees;
create trigger payees_audit
  after insert or update or delete on public.payees
  for each row execute function public.audit_trigger();
