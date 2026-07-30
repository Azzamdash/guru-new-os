
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_confirmation_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_confirmation_status_check
      CHECK (confirmation_status IN ('pending','confirmed','cancelled'));
  END IF;
END $$;

UPDATE public.orders
SET confirmation_status = CASE
  WHEN fulfillment_status IN ('processing','shipped','delivered','returned') THEN 'confirmed'
  WHEN fulfillment_status = 'cancelled' THEN 'cancelled'
  ELSE 'pending'
END
WHERE confirmation_status = 'pending';

CREATE INDEX IF NOT EXISTS orders_confirmation_status_idx
  ON public.orders(confirmation_status);
