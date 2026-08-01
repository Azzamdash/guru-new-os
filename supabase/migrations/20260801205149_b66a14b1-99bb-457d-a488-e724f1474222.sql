ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_user ON public.orders (assigned_user_id) WHERE assigned_user_id IS NOT NULL;

ALTER TABLE public.order_assignment_log ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE public.order_assignment_log ADD COLUMN IF NOT EXISTS previous_assigned_user_id uuid;

UPDATE public.orders o
SET assigned_user_id = e.user_id
FROM public.employees e
WHERE o.employee_id = e.id AND e.user_id IS NOT NULL AND o.assigned_user_id IS NULL;