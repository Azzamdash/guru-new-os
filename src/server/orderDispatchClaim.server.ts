import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export async function claimOrderDispatch(client: Client, orderId: string): Promise<string> {
  const token = crypto.randomUUID();
  const { data, error } = await client.rpc("claim_order_dispatch", {
    _order_id: orderId,
    _claim_token: token,
  });
  if (error) throw error;
  if (!data) throw new Error("تعذر حجز الأوردر للإرسال");
  return token;
}

export async function releaseOrderDispatchClaim(
  client: Client,
  orderId: string,
  token: string,
): Promise<void> {
  const { error } = await client.rpc("release_order_dispatch_claim", {
    _order_id: orderId,
    _claim_token: token,
  });
  if (error) throw error;
}

export async function finalizeOrderDispatch(
  client: Client,
  orderId: string,
  token: string,
  tracking: string,
  deliveryId: string | null,
): Promise<void> {
  const { data, error } = await client.rpc("finalize_order_dispatch", {
    _order_id: orderId,
    _claim_token: token,
    _tracking: tracking,
    _delivery_id: deliveryId ?? "",
  });
  if (error) throw error;
  if (!data) throw new Error("تعذر تثبيت رقم شحنة بوسطة");
}
