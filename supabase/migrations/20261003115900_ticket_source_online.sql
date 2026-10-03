-- Online (website) pass sales. Separate migration: a new enum value must be
-- committed before anything uses it.
alter type public.ticket_source add value if not exists 'online';
