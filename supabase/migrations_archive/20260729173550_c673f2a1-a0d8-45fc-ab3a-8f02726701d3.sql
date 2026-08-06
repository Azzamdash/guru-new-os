DROP TRIGGER IF EXISTS trg_sync_supplier_payment_del ON public.supplier_payments;

CREATE TRIGGER trg_sync_supplier_payment_del
AFTER DELETE ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_supplier_payment_delete();