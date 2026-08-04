
CREATE TABLE IF NOT EXISTS public.fulfillment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  orders_prepared integer NOT NULL DEFAULT 0,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fulfillment_entries TO authenticated;
GRANT ALL ON public.fulfillment_entries TO service_role;

ALTER TABLE public.fulfillment_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment"
  ON public.fulfillment_entries FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_section_access(auth.uid(),'couriers')
    OR public.has_section_access(auth.uid(),'reports_production')
  );

DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment"
  ON public.fulfillment_entries FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'data_entry')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'data_entry')
  );

DROP TRIGGER IF EXISTS trg_fulfillment_updated ON public.fulfillment_entries;
CREATE TRIGGER trg_fulfillment_updated
  BEFORE UPDATE ON public.fulfillment_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fulfillment_date ON public.fulfillment_entries(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_brand ON public.fulfillment_entries(brand_id);
