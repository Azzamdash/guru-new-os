-- Re-grant EXECUTE on reconcile_release_order_dispatch_claim (it was revoked
-- while still in active use by the couriers write flow).

GRANT EXECUTE ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid, boolean) TO authenticated, service_role;