-- Supplier return invoices: mirrors the existing sales_invoices 'purchase'/'return'
-- convention. A supplier_invoices row with type='return' represents goods sent
-- back to a supplier (reduces what we owe them); its line items decrement stock
-- instead of increasing it. Existing/new normal invoices default to 'purchase',
-- so this is additive and changes no existing behavior.
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'purchase' CHECK (type IN ('purchase', 'return'));

-- Must be a separate migration from anything that uses this value: Postgres
-- doesn't allow a new enum value to be referenced in the same transaction
-- that added it.
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'supplier_return';
