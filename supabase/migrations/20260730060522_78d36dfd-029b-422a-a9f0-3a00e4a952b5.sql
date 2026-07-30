REVOKE ALL ON FUNCTION public.im_validate_target() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.im_update_moving_avg() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.im_consume_bom() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sii_stock_in() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_deduct_stock() FROM anon, authenticated;