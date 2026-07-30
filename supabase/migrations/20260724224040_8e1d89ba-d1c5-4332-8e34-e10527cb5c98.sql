ALTER TABLE public.service_projects
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_projects_invoice ON public.service_projects(invoice_id);