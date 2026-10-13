-- NJF (NotJustFriends) weekly events income — Rally & Rank, Spike & Chill,
-- Total Tuesdays, Rise & Pickle, leagues — as its own revenue category so it
-- pairs with the existing "NJF" expense category. Bigger hosted events stay
-- under 'event' (paired with the "Event" expense category).
alter type public.revenue_category add value if not exists 'njf';
