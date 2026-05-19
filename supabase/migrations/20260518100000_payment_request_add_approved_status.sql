-- Add 'approved' state to payment_request_status. Separate migration
-- because we can't use a newly-added enum value in the same transaction.
alter type public.payment_request_status add value if not exists 'approved' before 'paid';
