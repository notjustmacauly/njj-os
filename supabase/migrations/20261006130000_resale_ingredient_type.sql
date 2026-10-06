-- New inventory category for bought-to-resell goods (e.g. bottled water).
-- Separate migration so the enum value is committed before it's used.
alter type public.ingredient_type add value if not exists 'resale';
