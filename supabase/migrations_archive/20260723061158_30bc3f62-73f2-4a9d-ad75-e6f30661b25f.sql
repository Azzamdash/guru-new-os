
REVOKE EXECUTE ON FUNCTION public.orders_sync_invoice() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_items_sync_invoice_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_delete_invoice() FROM PUBLIC, anon, authenticated;
