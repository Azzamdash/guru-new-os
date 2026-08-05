-- Stock transfers between brands/branches: new movement types + linking column.
-- ALTER TYPE ... ADD VALUE must not be used in the same transaction as any
-- expression that references the new value, so this migration ONLY adds the
-- enum values and the transfer_group column. The trigger update and the
-- transfer_stock() RPC that actually use 'transfer_in'/'transfer_out' live in
-- the next migration file.

ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'transfer_in';
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'transfer_out';
-- Also added here (not in the purchase-orders migration) for the same reason:
-- a fresh enum value can't be referenced in the same transaction it's added in.
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'purchase_receipt';

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS transfer_group uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_transfer_group
  ON public.inventory_movements(transfer_group)
  WHERE transfer_group IS NOT NULL;
