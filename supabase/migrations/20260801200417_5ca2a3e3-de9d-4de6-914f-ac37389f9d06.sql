
-- Shipments
CREATE TABLE public.order_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  tracking text,
  status text NOT NULL DEFAULT 'created',
  expected_cod numeric NOT NULL DEFAULT 0,
  shipping_fee numeric NOT NULL DEFAULT 0,
  shipped_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  note text,
  raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt_no)
);
CREATE INDEX order_shipments_order_idx ON public.order_shipments(order_id, attempt_no);
CREATE INDEX order_shipments_brand_idx ON public.order_shipments(brand_id, shipped_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_shipments TO authenticated;
GRANT ALL ON public.order_shipments TO service_role;
ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_shipments_read" ON public.order_shipments FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_shipments_insert" ON public.order_shipments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_shipments_update" ON public.order_shipments FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_shipments_delete" ON public.order_shipments FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));

CREATE TRIGGER order_shipments_updated_at BEFORE UPDATE ON public.order_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Collections
CREATE TABLE public.order_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shipment_id uuid REFERENCES public.order_shipments(id) ON DELETE SET NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cod',
  collected_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_collections_order_idx ON public.order_collections(order_id, collected_at DESC);
CREATE INDEX order_collections_brand_idx ON public.order_collections(brand_id, collected_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collections TO authenticated;
GRANT ALL ON public.order_collections TO service_role;
ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_collections_read" ON public.order_collections FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_collections_insert" ON public.order_collections FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_collections_update" ON public.order_collections FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "order_collections_delete" ON public.order_collections FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));

CREATE TRIGGER order_collections_updated_at BEFORE UPDATE ON public.order_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WhatsApp threads
CREATE TABLE public.whatsapp_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  phone text NOT NULL,
  display_name text,
  wa_conversation_id text,
  status text NOT NULL DEFAULT 'open',
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, phone)
);
CREATE INDEX whatsapp_threads_brand_idx ON public.whatsapp_threads(brand_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_threads TO authenticated;
GRANT ALL ON public.whatsapp_threads TO service_role;
ALTER TABLE public.whatsapp_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_threads_read" ON public.whatsapp_threads FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_threads_insert" ON public.whatsapp_threads FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_threads_update" ON public.whatsapp_threads FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_threads_delete" ON public.whatsapp_threads FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));

CREATE TRIGGER whatsapp_threads_updated_at BEFORE UPDATE ON public.whatsapp_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WhatsApp messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.whatsapp_threads(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  direction text NOT NULL DEFAULT 'out',
  body text,
  media_url text,
  wa_message_id text UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_thread_idx ON public.whatsapp_messages(thread_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_messages_read" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_messages_insert" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_messages_update" ON public.whatsapp_messages FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
CREATE POLICY "whatsapp_messages_delete" ON public.whatsapp_messages FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
