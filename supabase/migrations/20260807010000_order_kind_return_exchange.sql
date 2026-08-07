-- Lets staff create a return/exchange order directly in the system (rather
-- than only ever importing one from Shopify) and link it back to the sale
-- order it relates to.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_kind_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_kind_check CHECK (order_kind IN ('sale', 'return', 'exchange'));
  END IF;
END $mig$;

CREATE INDEX IF NOT EXISTS orders_related_order_id_idx ON public.orders(related_order_id);
