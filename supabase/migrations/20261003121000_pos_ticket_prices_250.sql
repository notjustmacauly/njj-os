-- All event passes are now ₱250 per sport, at the door (Event POS) too.
-- Paddle rentals stay ₱50.
update public.ticket_types set price = 250
 where code in ('TT-BADMINTON','TT-VOLLEYBALL','TT-GENERAL','RAP-OTD','RR-PICKLE','RR-BADMINTON');
