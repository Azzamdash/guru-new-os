import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DataHealthReport = {
  generatedAt: string;
  integrations: Array<{
    brand: string;
    provider: string;
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
    minutesSinceSync: number | null;
  }>;
  cogsZero: {
    orderItems: number;
    products: number;
    ordersWithZeroCost: number;
  };
  couriers: {
    unreconciledInvoices: number; // sales - collections drift
    totalOpenCod: number;
  };
  orphans: {
    ordersMissingInvoice: number;
    invoicesMissingBrand: number;
    salesInvoicesWithoutStage: number;
  };
  webhooks: {
    last24hFailures: number;
    last24hSuccess: number;
  };
};

export const getDataHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DataHealthReport> => {
    const s = context.supabase;
    const now = Date.now();

    // Integrations
    const { data: integs } = await s
      .from("brand_integrations")
      .select("provider, status, last_sync_at, last_error, brand_id, brands(name)")
      .order("last_sync_at", { ascending: false });

    const integrations = (integs ?? []).map((r: {
      provider: string;
      status: string;
      last_sync_at: string | null;
      last_error: string | null;
      brands?: { name: string } | null;
    }) => ({
      brand: r.brands?.name ?? "—",
      provider: r.provider,
      status: r.status,
      lastSyncAt: r.last_sync_at,
      lastError: r.last_error,
      minutesSinceSync: r.last_sync_at
        ? Math.round((now - new Date(r.last_sync_at).getTime()) / 60000)
        : null,
    }));

    // COGS zero counts
    const [zeroItems, zeroProducts, zeroCostOrders] = await Promise.all([
      s.from("order_items").select("id", { count: "exact", head: true }).eq("unit_cost", 0).not("product_id", "is", null),
      s.from("products").select("id", { count: "exact", head: true }).is("cogs_override", null).eq("moving_avg_cost", 0),
      s.from("orders").select("id", { count: "exact", head: true }).eq("cost_total", 0).gt("total_amount", 0),
    ]);

    // Courier drift
    const { data: courierData } = await s
      .from("sales_invoices")
      .select("total_amount, collected_amount, type")
      .eq("type", "sale");
    const openCod = (courierData ?? []).reduce(
      (a: number, r: { total_amount: number; collected_amount: number }) =>
        a + Math.max(0, (Number(r.total_amount) || 0) - (Number(r.collected_amount) || 0)),
      0,
    );

    // Orphans
    const [ordersNoInv, invNoBrand] = await Promise.all([
      s.from("orders").select("id", { count: "exact", head: true }).is("invoice_id", null),
      s.from("sales_invoices").select("id", { count: "exact", head: true }).is("brand_id", null),
    ]);

    // Webhook success/failure (integration_logs last 24h)
    const since = new Date(now - 24 * 3600_000).toISOString();
    const [wFail, wOk] = await Promise.all([
      s.from("integration_logs").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "error"),
      s.from("integration_logs").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "ok"),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      integrations,
      cogsZero: {
        orderItems: zeroItems.count ?? 0,
        products: zeroProducts.count ?? 0,
        ordersWithZeroCost: zeroCostOrders.count ?? 0,
      },
      couriers: {
        unreconciledInvoices: 0,
        totalOpenCod: openCod,
      },
      orphans: {
        ordersMissingInvoice: ordersNoInv.count ?? 0,
        invoicesMissingBrand: invNoBrand.count ?? 0,
        salesInvoicesWithoutStage: 0,
      },
      webhooks: {
        last24hFailures: wFail.count ?? 0,
        last24hSuccess: wOk.count ?? 0,
      },
    };
  });
