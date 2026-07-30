import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeBrandNetProfit } from "./profits.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function isAdmin(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

async function assertAdmin(ctx: Ctx) {
  if (!(await isAdmin(ctx))) throw new Error("Forbidden: admin only");
}

export const listInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: investors, error } = await context.supabase
      .from("investors")
      .select("id, name, email, phone, notes, user_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const { data: shares } = await context.supabase
      .from("investor_brand_shares")
      .select("id, investor_id, brand_id, share_percentage");
    return {
      investors: investors ?? [],
      shares: shares ?? [],
    };
  });

export const upsertInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    user_id?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      name: data.name.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      notes: data.notes?.trim() || null,
      user_id: data.user_id || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("investors").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("investors")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: created.id };
  });

export const deleteInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("investors").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setInvestorShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    investor_id: string;
    shares: Array<{ brand_id: string; share_percentage: number }>;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("investor_brand_shares").delete().eq("investor_id", data.investor_id);
    const rows = data.shares
      .filter((s) => s.brand_id && s.share_percentage > 0 && s.share_percentage <= 100)
      .map((s) => ({
        investor_id: data.investor_id,
        brand_id: s.brand_id,
        share_percentage: s.share_percentage,
      }));
    if (rows.length) {
      const { error } = await context.supabase.from("investor_brand_shares").insert(rows);
      if (error) throw error;
    }
    return { ok: true };
  });

// A4: Delegates to the same net-profit definition used by CEO reports
// (revenue - COGS via product_cogs - expense_entries), so investor P&L and
// executive/profits reports never disagree.
async function computeBrandProfit(
  ctx: Ctx,
  brandId: string,
  from?: string,
  to?: string,
): Promise<{ revenue: number; costs: number; profit: number }> {
  const r = await computeBrandNetProfit(ctx.supabase, brandId, from, to);
  return { revenue: r.revenue, costs: r.cogs + r.expenses, profit: r.netProfit };
}

// Compute per-brand valuation (annual revenue x1.5 + net assets) for a specific brand.
async function computeBrandValuation(ctx: Ctx, brandId: string): Promise<{ annual_revenue: number; assets_net: number; valuation: number }> {
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [invRes, aRes] = await Promise.all([
    ctx.supabase.from("sales_invoices").select("total_amount, type, occurred_at").eq("brand_id", brandId).gte("occurred_at", yearAgo),
    ctx.supabase.from("company_assets").select("cost, purchase_date, annual_depreciation_rate").eq("brand_id", brandId),
  ]);
  const invoices = (invRes.data ?? []) as Array<{ total_amount: number; type: string }>;
  const assets = (aRes.data ?? []) as Array<{ cost: number; purchase_date: string; annual_depreciation_rate: number }>;
  const revenue = invoices.reduce((s, r) => s + (r.type === "return" ? -1 : 1) * (Number(r.total_amount) || 0), 0);
  const now = Date.now();
  let assetsNet = 0;
  for (const a of assets) {
    const cost = Number(a.cost) || 0;
    const rate = Number(a.annual_depreciation_rate) || 0;
    const years = Math.max(0, (now - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000));
    const acc = Math.min(cost, cost * (rate / 100) * years);
    assetsNet += Math.max(0, cost - acc);
  }
  return { annual_revenue: revenue, assets_net: assetsNet, valuation: revenue * 1.5 + assetsNet };
}

async function computeInvestorValuation(ctx: Ctx, investorId: string) {
  const { data: shares } = await ctx.supabase
    .from("investor_brand_shares")
    .select("brand_id, share_percentage, brands:brands(id, name, type)")
    .eq("investor_id", investorId);
  const rows = await Promise.all(
    (shares ?? []).map(async (s: { brand_id: string; share_percentage: number; brands: { name: string; type: string } | null }) => {
      const v = await computeBrandValuation(ctx, s.brand_id);
      const pct = Number(s.share_percentage) || 0;
      return {
        brand_id: s.brand_id,
        brand_name: s.brands?.name ?? "",
        brand_type: s.brands?.type ?? "product",
        share_percentage: pct,
        annual_revenue: v.annual_revenue,
        assets_net: v.assets_net,
        brand_valuation: v.valuation,
        investor_valuation: (v.valuation * pct) / 100,
      };
    }),
  );
  const brand_totals = rows.reduce(
    (acc, r) => ({
      brand_valuation: acc.brand_valuation + r.brand_valuation,
      investor_valuation: acc.investor_valuation + r.investor_valuation,
    }),
    { brand_valuation: 0, investor_valuation: 0 },
  );

  // Total company valuation (all active brands + company-wide assets), then take
  // the investor's *effective* company share = sum of (brand_valuation_i * pct_i) / total_company_valuation
  const { data: brandsAll } = await ctx.supabase.from("brands").select("id").eq("active", true);
  const allBrandVals = await Promise.all(((brandsAll ?? []) as Array<{ id: string }>).map((b) => computeBrandValuation(ctx, b.id)));
  const totalBrandVal = allBrandVals.reduce((s, v) => s + v.valuation, 0);
  const { data: cwAssets } = await ctx.supabase.from("company_assets").select("cost, purchase_date, annual_depreciation_rate").is("brand_id", null);
  const now = Date.now();
  let cwNet = 0;
  for (const a of ((cwAssets ?? []) as Array<{ cost: number; purchase_date: string; annual_depreciation_rate: number }>)) {
    const cost = Number(a.cost) || 0;
    const rate = Number(a.annual_depreciation_rate) || 0;
    const years = Math.max(0, (now - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000));
    const acc = Math.min(cost, cost * (rate / 100) * years);
    cwNet += Math.max(0, cost - acc);
  }
  const totalCompanyValuation = totalBrandVal + cwNet;
  // Effective ownership fraction of the whole company = investor_valuation / totalBrandVal (only brand-scoped)
  const effectiveOwnership = totalBrandVal > 0 ? brand_totals.investor_valuation / totalBrandVal : 0;
  const company_share = totalCompanyValuation * effectiveOwnership;

  return {
    rows,
    brand_totals,
    company: {
      total_company_valuation: totalCompanyValuation,
      company_wide_assets_net: cwNet,
      effective_ownership_pct: effectiveOwnership * 100,
      investor_company_share: company_share,
    },
  };
}

export const getInvestorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { investor_id: string; from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context);
    const { data: investor, error } = await context.supabase
      .from("investors")
      .select("id, name, email, phone, notes, user_id")
      .eq("id", data.investor_id)
      .maybeSingle();
    if (error) throw error;
    if (!investor) throw new Error("Investor not found");
    if (!admin && investor.user_id !== context.userId) throw new Error("Forbidden");

    const { data: shares } = await context.supabase
      .from("investor_brand_shares")
      .select("brand_id, share_percentage, brands:brands(id, name, type)")
      .eq("investor_id", data.investor_id);

    const rows = await Promise.all(
      (shares ?? []).map(async (s: { brand_id: string; share_percentage: number; brands: { id: string; name: string; type: string } | null }) => {
        const p = await computeBrandProfit(context, s.brand_id, data.from, data.to);
        const pct = Number(s.share_percentage) || 0;
        return {
          brand_id: s.brand_id,
          brand_name: s.brands?.name ?? "",
          brand_type: s.brands?.type ?? "product",
          share_percentage: pct,
          revenue: p.revenue,
          costs: p.costs,
          profit: p.profit,
          investor_profit: (p.profit * pct) / 100,
        };
      }),
    );

    const totals = rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        costs: acc.costs + r.costs,
        profit: acc.profit + r.profit,
        investor_profit: acc.investor_profit + r.investor_profit,
      }),
      { revenue: 0, costs: 0, profit: 0, investor_profit: 0 },
    );

    const valuation = await computeInvestorValuation(context, data.investor_id);
    return { investor, brands: rows, totals, valuation };
  });

export const getMyInvestorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("investors")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!inv) return null;
    // Reuse logic — call getInvestorSummary handler inline
    const { data: investor } = await context.supabase
      .from("investors")
      .select("id, name, email, phone, notes, user_id")
      .eq("id", inv.id)
      .maybeSingle();
    const { data: shares } = await context.supabase
      .from("investor_brand_shares")
      .select("brand_id, share_percentage, brands:brands(id, name, type)")
      .eq("investor_id", inv.id);
    const rows = await Promise.all(
      (shares ?? []).map(async (s: { brand_id: string; share_percentage: number; brands: { id: string; name: string; type: string } | null }) => {
        const p = await computeBrandProfit(context, s.brand_id, data.from, data.to);
        const pct = Number(s.share_percentage) || 0;
        return {
          brand_id: s.brand_id,
          brand_name: s.brands?.name ?? "",
          brand_type: s.brands?.type ?? "product",
          share_percentage: pct,
          revenue: p.revenue,
          costs: p.costs,
          profit: p.profit,
          investor_profit: (p.profit * pct) / 100,
        };
      }),
    );
    const totals = rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        costs: acc.costs + r.costs,
        profit: acc.profit + r.profit,
        investor_profit: acc.investor_profit + r.investor_profit,
      }),
      { revenue: 0, costs: 0, profit: 0, investor_profit: 0 },
    );
    const valuation = await computeInvestorValuation(context, inv.id);
    return { investor, brands: rows, totals, valuation };
  });

// Audit: list all investor shares with brand info & last modification date.
// Admin sees all; investor sees only their own.
export const listInvestorSharesAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context);
    let investorFilterId: string | null = null;
    if (!admin) {
      const { data: inv } = await context.supabase
        .from("investors")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!inv) return { rows: [], isAdmin: false };
      investorFilterId = inv.id;
    }
    let q = context.supabase
      .from("investor_brand_shares")
      .select("id, share_percentage, created_at, updated_at, investor_id, brand_id, investors:investors(id, name, email), brands:brands(id, name, type)")
      .order("updated_at", { ascending: false });
    if (investorFilterId) q = q.eq("investor_id", investorFilterId);
    const { data, error } = await q;
    if (error) throw error;
    return {
      isAdmin: admin,
      rows: (data ?? []).map((r: any) => ({
        id: r.id,
        investor_id: r.investor_id,
        investor_name: r.investors?.name ?? "",
        investor_email: r.investors?.email ?? "",
        brand_id: r.brand_id,
        brand_name: r.brands?.name ?? "",
        brand_type: r.brands?.type ?? "",
        share_percentage: Number(r.share_percentage) || 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    };
  });

// Analytical P&L across investors × brands. Admin sees all, investor sees own only.
export const listInvestorsPnL = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context);
    let investorFilterId: string | null = null;
    if (!admin) {
      const { data: inv } = await context.supabase
        .from("investors")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!inv) return { rows: [], isAdmin: false };
      investorFilterId = inv.id;
    }
    let sq = context.supabase
      .from("investor_brand_shares")
      .select("id, share_percentage, updated_at, investor_id, brand_id, investors:investors(id, name, email), brands:brands(id, name, type)");
    if (investorFilterId) sq = sq.eq("investor_id", investorFilterId);
    const { data: shares, error } = await sq;
    if (error) throw error;

    const cache = new Map<string, { revenue: number; costs: number; profit: number }>();
    const getP = async (bid: string) => {
      if (!cache.has(bid)) cache.set(bid, await computeBrandProfit(context, bid, data.from, data.to));
      return cache.get(bid)!;
    };

    const rows = await Promise.all(
      (shares ?? []).map(async (s: any) => {
        const p = await getP(s.brand_id);
        const pct = Number(s.share_percentage) || 0;
        return {
          share_id: s.id,
          investor_id: s.investor_id,
          investor_name: s.investors?.name ?? "",
          investor_email: s.investors?.email ?? "",
          brand_id: s.brand_id,
          brand_name: s.brands?.name ?? "",
          brand_type: s.brands?.type ?? "product",
          share_percentage: pct,
          revenue: p.revenue,
          costs: p.costs,
          profit: p.profit,
          investor_profit: (p.profit * pct) / 100,
          updated_at: s.updated_at,
        };
      }),
    );
    return { isAdmin: admin, rows };
  });

// Valuation per investor: brand valuations and investor's share of each.
// Admin sees all; investor sees only their own row.
export const listInvestorsValuation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context);
    let investorFilterId: string | null = null;
    if (!admin) {
      const { data: inv } = await context.supabase
        .from("investors").select("id").eq("user_id", context.userId).maybeSingle();
      if (!inv) return { isAdmin: false, rows: [] };
      investorFilterId = inv.id;
    }
    let invQ = context.supabase.from("investors").select("id, name, email");
    if (investorFilterId) invQ = invQ.eq("id", investorFilterId);
    const { data: investors, error } = await invQ;
    if (error) throw error;
    const rows = await Promise.all(
      ((investors ?? []) as Array<{ id: string; name: string; email: string | null }>).map(async (i) => {
        const v = await computeInvestorValuation(context, i.id);
        return {
          investor_id: i.id,
          investor_name: i.name,
          investor_email: i.email ?? "",
          brands: v.rows,
          brand_valuation_total: v.brand_totals.brand_valuation,
          investor_valuation_total: v.brand_totals.investor_valuation,
          total_company_valuation: v.company.total_company_valuation,
          effective_ownership_pct: v.company.effective_ownership_pct,
          investor_company_share: v.company.investor_company_share,
        };
      }),
    );
    return { isAdmin: admin, rows };
  });
