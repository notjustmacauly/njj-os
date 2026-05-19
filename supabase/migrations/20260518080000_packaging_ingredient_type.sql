-- Add 'packaging' value to ingredient_type enum. Separate migration because
-- PG won't allow using a newly-added enum value in the same transaction.
alter type public.ingredient_type add value if not exists 'packaging';
