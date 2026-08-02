import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function hasAnyRole(context: Ctx, roles: string[]) {
  const results = await Promise.all(
    roles.map((r) => context.supabase.rpc("has_role", { _user_id: context.userId, _role: r })),
  );
  return results.some((r) => !r.error && r.data === true);
}
async function assertWriter(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager", "accountant"]))) throw new Error("Forbidden");
}
async function assertManager(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager"]))) throw new Error("Forbidden");
}

export type CompanyAsset = {
  id: string;
  brand_id: string | null;
  name: string;
  cost: number;
  purchase_date: string;
  annual_depreciation_rate: number;
  notes: string | null;
};

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("company_assets").select("*").order("purchase_date", { ascending: false });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as CompanyAsset[];
  });

export const upsertAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CompanyAsset> & { name: string; cost: number; purchase_date: string; annual_depreciation_rate: number }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("company_assets").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("company_assets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

function netBookValue(a: CompanyAsset, asOf: Date): number {
  const cost = Number(a.cost) || 0;
  const rate = Number(a.annual_depreciation_rate) || 0;
  const purchase = new Date(a.purchase_date);
  const years = Math.max(0, (asOf.getTime() - purchase.getTime()) / (365.25 * 24 * 3600 * 1000));
  const accumulated = Math.min(cost, cost * (rate / 100) * years);
  return Math.max(0, cost - accumulated);
}

export const getAssetsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("company_assets").select("*");
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as CompanyAsset[];
    const now = new Date();
    let totalCost = 0;
    let totalNet = 0;
    let annualDepreciation = 0;
    for (const a of list) {
      const cost = Number(a.cost) || 0;
      totalCost += cost;
      totalNet += netBookValue(a, now);
      annualDepreciation += cost * ((Number(a.annual_depreciation_rate) || 0) / 100);
    }
    return { count: list.length, totalCost, totalNet, annualDepreciation };
  });

// Company valuation per brand: annual revenue * 1.5 + net book value of assets
export const getValuationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const [brandsRes, revByBrand, assetsRes] = await Promise.all([
      context.supabase.from("brands").select("id,name,type,active").order("sort_order").order("name"),
      revenueByBrandSince(context.supabase, yearAgo),
      context.supabase.from("company_assets").select("*"),
    ]);
    if (brandsRes.error) throw brandsRes.error;
    if (assetsRes.error) throw assetsRes.error;

    const brands = brandsRes.data as Array<{ id: string; name: string; type: string; active: boolean }>;
    const assets = (assetsRes.data ?? []) as CompanyAsset[];
    const assetsByBrand = new Map<string, { cost: number; net: number }>();
    let companyWideCost = 0;
    let companyWideNet = 0;
    for (const a of assets) {
      const cost = Number(a.cost) || 0;
      const net = netBookValue(a, now);
      if (!a.brand_id) {
        companyWideCost += cost;
        companyWideNet += net;
      } else {
        const cur = assetsByBrand.get(a.brand_id) ?? { cost: 0, net: 0 };
        cur.cost += cost; cur.net += net;
        assetsByBrand.set(a.brand_id, cur);
      }
    }

    const rows = brands.map((b) => {
      const revenue = revByBrand.get(b.id) ?? 0;
      const assetsNet = assetsByBrand.get(b.id)?.net ?? 0;
      const assetsCost = assetsByBrand.get(b.id)?.cost ?? 0;
      const valuation = revenue * 1.5 + assetsNet;
      return {
        brand_id: b.id, brand_name: b.name, brand_type: b.type,
        annual_revenue: revenue, assets_cost: assetsCost, assets_net: assetsNet,
        valuation,
      };
    });

    const totals = rows.reduce((acc, r) => ({
      annual_revenue: acc.annual_revenue + r.annual_revenue,
      assets_net: acc.assets_net + r.assets_net + 0,
      valuation: acc.valuation + r.valuation,
    }), { annual_revenue: 0, assets_net: 0, valuation: 0 });

    return {
      rows,
      totals,
      companyWide: { cost: companyWideCost, net: companyWideNet },
      totalCompanyValuation: totals.valuation + companyWideNet,
    };
  });
