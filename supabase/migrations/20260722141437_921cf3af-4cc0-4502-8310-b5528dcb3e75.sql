
CREATE TABLE public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('product','material','other')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  description text,
  qty numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_items TO authenticated;
GRANT ALL ON public.supplier_invoice_items TO service_role;

ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice items read via parent invoice brand"
  ON public.supplier_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = invoice_id
      AND (si.brand_id IS NULL OR public.has_brand_access(auth.uid(), si.brand_id))
  ));

CREATE POLICY "invoice items write for writers"
  ON public.supplier_invoice_items FOR ALL TO authenticated
  USING (public.is_writer(auth.uid()))
  WITH CHECK (public.is_writer(auth.uid()));

CREATE TRIGGER trg_supplier_invoice_items_updated
  BEFORE UPDATE ON public.supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_supplier_invoice_items_invoice ON public.supplier_invoice_items(invoice_id);
