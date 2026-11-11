-- New fulfillment status "Received" (set when the receiver digitally accepts the
-- delivery). Separate migration so the enum value is committed before use.
alter type public.fulfillment_status add value if not exists 'Received' after 'Delivered';
