-- 20260801045929 revoked EXECUTE on reconcile_release_order_dispatch_claim from
-- authenticated, leaving only service_role. This function is the staff-facing
-- "release a stuck dispatch claim" recovery path — it is SECURITY DEFINER and
-- already enforces auth.uid(), an admin/manager role check, can_write_page('/couriers')
-- and brand access internally, so it was designed to be called by signed-in staff,
-- not a backend job. No UI currently calls it, but restoring the grant now avoids
-- repeating the same permission-denied incident that broke finalize_generic_order_dispatch
-- the moment this recovery path gets wired into the UI.
GRANT EXECUTE ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid, boolean)
  TO authenticated, service_role;
