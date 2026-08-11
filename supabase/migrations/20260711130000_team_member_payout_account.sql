-- Payout account for reimbursements, stored on the team member (kept separate
-- from the payee directory). Surfaced only to owner/partner/manager, who pay
-- reimbursements out.
alter table public.team_members
  add column if not exists bank_name      text,
  add column if not exists account_number text,
  add column if not exists account_name   text;
