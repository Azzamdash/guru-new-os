ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS building_number text,
  ADD COLUMN IF NOT EXISTS floor_number text,
  ADD COLUMN IF NOT EXISTS apartment_number text;