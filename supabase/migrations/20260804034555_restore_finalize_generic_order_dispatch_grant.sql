-- 20260801054605 revoked EXECUTE on finalize_generic_order_dispatch from authenticated,
-- believing it was unused. It is actively called by the courier/rep dispatch flow
-- (couriers.functions.ts -> dispatchOrderToBestCourier), so the revoke broke assigning
-- orders to a shipping company or rep ("permission denied for function
-- finalize_generic_order_dispatch"). The function is SECURITY DEFINER and already
-- enforces auth.uid(), has_brand_access, can_write_page('/couriers') and
-- courier_serves_brand internally, so it is safe to grant back to authenticated.
GRANT EXECUTE ON FUNCTION public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text)
  TO authenticated, service_role;
