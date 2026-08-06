
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_point numeric NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS worker_name text;
CREATE INDEX IF NOT EXISTS idx_suppliers_brand_id ON public.suppliers(brand_id);
CREATE INDEX IF NOT EXISTS idx_inv_moves_worker ON public.inventory_movements(worker_name);
