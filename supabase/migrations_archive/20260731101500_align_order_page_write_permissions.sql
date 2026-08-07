-- Align order page permissions across UI, server functions, direct table writes, and the atomic RPC.

CREATE OR REPLACE FUNCTION public.page_access_level(_user_id uuid, _route text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'manager') THEN
    RETURN 'write';
  END IF;
  IF public.has_section_access(_user_id, 'deny:' || _route) THEN
    RETURN 'hidden';
  END IF;
  IF public.has_section_access(_user_id, 'write:' || _route) THEN
    RETURN 'write';
  END IF;
  IF public.has_section_access(_user_id, 'page:' || _route) THEN
    RETURN CASE WHEN public.is_writer(_user_id) THEN 'write' ELSE 'read' END;
  END IF;
  IF public.is_writer(_user_id) THEN
    RETURN 'write';
  END IF;
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS orders_writer_all ON public.orders;
CREATE POLICY orders_writer_all ON public.orders
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/orders')
  AND public.has_brand_access(auth.uid(), brand_id)
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/orders')
  AND public.has_brand_access(auth.uid(), brand_id)
);

DROP POLICY IF EXISTS order_items_writer ON public.order_items;
CREATE POLICY order_items_writer ON public.order_items
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/orders')
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.has_brand_access(auth.uid(), o.brand_id)
  )
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/orders')
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.has_brand_access(auth.uid(), o.brand_id)
  )
);

COMMENT ON FUNCTION public.page_access_level(uuid, text) IS
  'Explicit deny wins; page grants use the user role for write access; legacy writers retain fallback write access.';
