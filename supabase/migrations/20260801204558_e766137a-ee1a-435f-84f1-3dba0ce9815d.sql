CREATE TABLE public.order_assignment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  method text NOT NULL DEFAULT 'manual',
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oal_order ON public.order_assignment_log(order_id, created_at DESC);
CREATE INDEX idx_oal_employee ON public.order_assignment_log(employee_id, created_at DESC);
CREATE INDEX idx_oal_created ON public.order_assignment_log(created_at DESC);

GRANT SELECT, INSERT ON public.order_assignment_log TO authenticated;
GRANT ALL ON public.order_assignment_log TO service_role;

ALTER TABLE public.order_assignment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oal_read" ON public.order_assignment_log;
CREATE POLICY "oal_read" ON public.order_assignment_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "oal_insert" ON public.order_assignment_log;
CREATE POLICY "oal_insert" ON public.order_assignment_log
  FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;